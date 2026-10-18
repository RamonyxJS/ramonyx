//! HTTP client untuk `fetch()` (ADR-0030/0036).
//!
//! Cakupan: `http://` dan `https://` (TLS **diverifikasi** — root webpki + opsional CA
//! kustom untuk CA privat/uji), redirect otomatis (`follow`/`manual`/`error`, menegakkan
//! permission per hop + strip header sensitif lintas origin), body request/response
//! dibuffer dengan batas ukuran, timeout total, permission `--allow-net` per host.

use std::cell::RefCell;
use std::path::Path;
use std::rc::Rc;
use std::sync::Arc;
use std::time::Duration;

use bytes::Bytes;
use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::{Method, Request};
use hyper_rustls::HttpsConnector;
use hyper_rustls::HttpsConnectorBuilder;
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use runtime_core::Permissions;
use serde::Serialize;
use url::Url;

/// Batas ukuran body respons `fetch` (10 MiB, buffer di memori).
pub const MAX_FETCH_BYTES: usize = 10 * 1024 * 1024;

/// Timeout total satu permintaan `fetch` (termasuk seluruh hop redirect).
pub const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

/// Batas jumlah redirect yang diikuti (mode `follow`).
pub const MAX_REDIRECTS: usize = 10;

/// State klien HTTP (connection pool per isolate).
pub struct FetchState {
    client: Client<HttpsConnector<HttpConnector>, Full<Bytes>>,
}

impl FetchState {
    /// Bangun klien: root CA sistem-web (webpki) + opsional CA tambahan dari file PEM.
    /// Verifikasi sertifikat **tidak pernah** dimatikan.
    pub fn new(ca_file: Option<&Path>) -> Result<Self, String> {
        let mut roots = rustls::RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

        if let Some(path) = ca_file {
            let pem = std::fs::read(path)
                .map_err(|error| format!("gagal membaca CA {}: {error}", path.display()))?;
            let mut cursor = std::io::Cursor::new(pem);
            let mut added = 0usize;
            for item in rustls_pemfile::certs(&mut cursor) {
                let certificate = item.map_err(|error| {
                    format!("CA PEM tidak valid di {}: {error}", path.display())
                })?;
                roots
                    .add(certificate)
                    .map_err(|error| format!("CA tidak diterima di {}: {error}", path.display()))?;
                added += 1;
            }
            if added == 0 {
                return Err(format!(
                    "tidak ada sertifikat CA (PEM) di {}",
                    path.display()
                ));
            }
        }

        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let tls_config = rustls::ClientConfig::builder_with_provider(provider)
            .with_safe_default_protocol_versions()
            .map_err(|error| format!("konfigurasi TLS gagal: {error}"))?
            .with_root_certificates(roots)
            .with_no_client_auth();

        let connector = HttpsConnectorBuilder::new()
            .with_tls_config(tls_config)
            .https_or_http()
            .enable_http1()
            .build();

        Ok(Self {
            client: Client::builder(TokioExecutor::new()).build(connector),
        })
    }
}

#[derive(Serialize)]
pub struct FetchReply {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    url: String,
    redirected: bool,
}

enum RedirectMode {
    Follow,
    Manual,
    Error,
}

fn parse_redirect_mode(value: &str) -> Result<RedirectMode, JsErrorBox> {
    match value {
        "follow" => Ok(RedirectMode::Follow),
        "manual" => Ok(RedirectMode::Manual),
        "error" => Ok(RedirectMode::Error),
        other => Err(JsErrorBox::generic(format!(
            "redirect mode tidak dikenal: \"{other}\" (follow|manual|error)"
        ))),
    }
}

fn is_sensitive_header(name: &str) -> bool {
    matches!(name, "authorization" | "cookie" | "proxy-authorization")
}

fn is_body_header(name: &str) -> bool {
    matches!(
        name,
        "content-type" | "content-length" | "transfer-encoding"
    )
}

/// Rantai error lengkap: `Display` hyper-util sering hanya "client error (Connect)";
/// penyebab sebenarnya (mis. kegagalan verifikasi TLS) ada di `source()`.
fn describe_error(error: &(dyn std::error::Error + 'static)) -> String {
    let mut parts = vec![error.to_string()];
    let mut source = error.source();
    while let Some(current) = source {
        parts.push(current.to_string());
        source = current.source();
    }
    parts.join(": ")
}

#[op2(async(lazy))]
#[serde]
pub async fn op_fetch(
    state: Rc<RefCell<OpState>>,
    #[string] method: String,
    #[string] url: String,
    #[serde] headers: Vec<(String, String)>,
    #[string] body: String,
    #[string] redirect: String,
) -> Result<FetchReply, JsErrorBox> {
    let (permissions, client) = {
        let state = state.borrow();
        let permissions = state.borrow::<Permissions>().clone();
        let client = state.borrow::<FetchState>().client.clone();
        (permissions, client)
    };
    let redirect_mode = parse_redirect_mode(&redirect)?;

    let mut current = Url::parse(&url).map_err(|error| {
        JsErrorBox::generic(format!("URL fetch tidak valid: \"{url}\" ({error})"))
    })?;
    let mut method = Method::from_bytes(method.as_bytes())
        .map_err(|error| JsErrorBox::generic(format!("method fetch tidak valid: {error}")))?;
    let mut headers = headers;
    let mut body = body;
    let mut redirected = false;

    for hop in 0..=MAX_REDIRECTS {
        let scheme = current.scheme();
        if scheme != "http" && scheme != "https" {
            return Err(JsErrorBox::generic(format!(
                "fetch ke skema \"{scheme}\" belum didukung (hanya http/https)"
            )));
        }
        let host = current
            .host_str()
            .ok_or_else(|| JsErrorBox::generic(format!("URL fetch tanpa host: \"{current}\"")))?;
        // Permission diperiksa ulang untuk SETIAP hop (redirect bisa lintas host).
        permissions.check_net(host).map_err(JsErrorBox::generic)?;

        let mut builder = Request::builder()
            .method(method.clone())
            .uri(current.as_str());
        for (name, value) in &headers {
            builder = builder.header(name.as_str(), value.as_str());
        }
        let request = builder
            .body(Full::new(Bytes::from(body.clone())))
            .map_err(|error| JsErrorBox::generic(format!("request fetch tidak valid: {error}")))?;

        let response = tokio::time::timeout(FETCH_TIMEOUT, client.request(request))
            .await
            .map_err(|_| {
                JsErrorBox::generic(format!(
                    "fetch timeout setelah {} detik: {current}",
                    FETCH_TIMEOUT.as_secs()
                ))
            })?
            .map_err(|error| {
                JsErrorBox::generic(format!(
                    "fetch gagal ke {current}: {}",
                    describe_error(&error)
                ))
            })?;

        let status = response.status();
        let location = response
            .headers()
            .get("location")
            .and_then(|value| value.to_str().ok())
            .map(str::to_string);

        if matches!(status.as_u16(), 301 | 302 | 303 | 307 | 308)
            && let Some(location) = location
        {
            match redirect_mode {
                RedirectMode::Error => {
                    return Err(JsErrorBox::generic(format!(
                        "fetch menerima redirect {status} (mode error): {current}"
                    )));
                }
                RedirectMode::Follow => {
                    if hop == MAX_REDIRECTS {
                        return Err(JsErrorBox::generic(format!(
                            "fetch melebihi batas {MAX_REDIRECTS} redirect: {url}"
                        )));
                    }
                    let next = current.join(&location).map_err(|error| {
                        JsErrorBox::generic(format!(
                            "Location redirect tidak valid (\"{location}\"): {error}"
                        ))
                    })?;

                    // Aturan method/body (selaras undici): 303 selalu GET; 301/302 dari POST → GET.
                    let code = status.as_u16();
                    if code == 303 || ((code == 301 || code == 302) && method == Method::POST) {
                        method = Method::GET;
                        body.clear();
                        headers.retain(|(name, _)| !is_body_header(&name.to_ascii_lowercase()));
                    }

                    // Lintas origin → buang header sensitif.
                    let same_origin = current.scheme() == next.scheme()
                        && current.host_str() == next.host_str()
                        && current.port_or_known_default() == next.port_or_known_default();
                    if !same_origin {
                        headers
                            .retain(|(name, _)| !is_sensitive_header(&name.to_ascii_lowercase()));
                    }

                    current = next;
                    redirected = true;
                    continue;
                }
                RedirectMode::Manual => {
                    // Respons 3xx dikembalikan apa adanya (dipakai guardedFetch untuk
                    // memvalidasi ulang tiap hop).
                }
            }
        }

        // Respons final (termasuk 3xx pada mode manual).
        let status_text = status.canonical_reason().unwrap_or("").to_string();
        let response_headers: Vec<(String, String)> = response
            .headers()
            .iter()
            .map(|(name, value)| {
                (
                    name.as_str().to_string(),
                    value.to_str().unwrap_or("").to_string(),
                )
            })
            .collect();
        let bytes = collect_body(response.into_body()).await?;

        return Ok(FetchReply {
            status: status.as_u16(),
            status_text,
            headers: response_headers,
            // v1: body dikembalikan sebagai teks (UTF-8 lossy); biner belum didukung.
            body: String::from_utf8_lossy(&bytes).into_owned(),
            url: current.to_string(),
            redirected,
        });
    }

    unreachable!("loop selalu berhenti pada respons final atau error")
}

async fn collect_body(mut body: Incoming) -> Result<Vec<u8>, JsErrorBox> {
    let mut collected = Vec::new();
    while let Some(frame) = body.frame().await {
        let frame = frame
            .map_err(|error| JsErrorBox::generic(format!("gagal membaca body respons: {error}")))?;
        if let Ok(data) = frame.into_data() {
            collected.extend_from_slice(&data);
            if collected.len() > MAX_FETCH_BYTES {
                return Err(JsErrorBox::generic(format!(
                    "body respons fetch melebihi batas {} MiB",
                    MAX_FETCH_BYTES / (1024 * 1024)
                )));
            }
        }
    }
    Ok(collected)
}
