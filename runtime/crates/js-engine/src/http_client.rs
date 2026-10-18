//! HTTP client minimal untuk `fetch()` (ADR-0030).
//!
//! Cakupan v1: skema `http://` saja (tanpa TLS), **tanpa redirect otomatis**, body request/response
//! dibuffer dengan batas ukuran, timeout total, dan permission `--allow-net` ditegakkan per host
//! (daftar host bila flag diberi nilai).
//!
//! `https://` ditolak dengan pesan jelas — bukan kegagalan misterius.

use std::cell::RefCell;
use std::rc::Rc;
use std::time::Duration;

use bytes::Bytes;
use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::{Method, Request, Uri};
use hyper_util::client::legacy::Client;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::rt::TokioExecutor;
use runtime_core::Permissions;
use serde::Serialize;

/// Batas ukuran body respons `fetch` (10 MiB, buffer di memori).
pub const MAX_FETCH_BYTES: usize = 10 * 1024 * 1024;

/// Timeout total satu permintaan `fetch`.
pub const FETCH_TIMEOUT: Duration = Duration::from_secs(30);

/// State klien HTTP (connection pool per isolate).
pub struct FetchState {
    client: Client<HttpConnector, Full<Bytes>>,
}

impl FetchState {
    pub fn new() -> Self {
        Self {
            client: Client::builder(TokioExecutor::new()).build_http::<Full<Bytes>>(),
        }
    }
}

impl Default for FetchState {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Serialize)]
pub struct FetchReply {
    status: u16,
    status_text: String,
    headers: Vec<(String, String)>,
    body: String,
    url: String,
}

#[op2(async(lazy))]
#[serde]
pub async fn op_fetch(
    state: Rc<RefCell<OpState>>,
    #[string] method: String,
    #[string] url: String,
    #[serde] headers: Vec<(String, String)>,
    #[string] body: String,
) -> Result<FetchReply, JsErrorBox> {
    let (permissions, client) = {
        let state = state.borrow();
        let permissions = state.borrow::<Permissions>().clone();
        let client = state.borrow::<FetchState>().client.clone();
        (permissions, client)
    };

    let uri: Uri = url.parse().map_err(|error| {
        JsErrorBox::generic(format!("URL fetch tidak valid: \"{url}\" ({error})"))
    })?;

    let scheme = uri.scheme_str().unwrap_or("");
    if scheme != "http" {
        let hint = if scheme == "https" {
            " (TLS belum didukung runtime ini)"
        } else {
            ""
        };
        return Err(JsErrorBox::generic(format!(
            "fetch ke skema \"{scheme}\" belum didukung{hint} — hanya http://"
        )));
    }

    let host = uri
        .host()
        .ok_or_else(|| JsErrorBox::generic(format!("URL fetch tanpa host: \"{url}\"")))?;
    permissions.check_net(host).map_err(JsErrorBox::generic)?;

    let method = Method::from_bytes(method.as_bytes())
        .map_err(|error| JsErrorBox::generic(format!("method fetch tidak valid: {error}")))?;

    let mut builder = Request::builder().method(method).uri(&uri);
    for (name, value) in &headers {
        builder = builder.header(name.as_str(), value.as_str());
    }
    let request = builder
        .body(Full::new(Bytes::from(body)))
        .map_err(|error| JsErrorBox::generic(format!("request fetch tidak valid: {error}")))?;

    let response = tokio::time::timeout(FETCH_TIMEOUT, client.request(request))
        .await
        .map_err(|_| {
            JsErrorBox::generic(format!(
                "fetch timeout setelah {} detik: {url}",
                FETCH_TIMEOUT.as_secs()
            ))
        })?
        .map_err(|error| JsErrorBox::generic(format!("fetch gagal ke {url}: {error}")))?;

    let status = response.status().as_u16();
    let status_text = response
        .status()
        .canonical_reason()
        .unwrap_or("")
        .to_string();
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

    Ok(FetchReply {
        status,
        status_text,
        headers: response_headers,
        // v1: body dikembalikan sebagai teks (UTF-8 lossy); biner belum didukung.
        body: String::from_utf8_lossy(&bytes).into_owned(),
        url,
    })
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
