//! HTTP server minimal untuk runtime (R2): model **pull** — JS memanggil `op_http_accept`
//! berulang dan `op_http_respond` untuk tiap request; Rust tidak pernah memanggil masuk ke V8.
//!
//! Cakupan R2a: body request/response di-buffer penuh (streaming menyusul), keep-alive dimatikan
//! per-request (`Connection: close`), graceful shutdown menyusul.

use std::cell::RefCell;
use std::collections::HashMap;
use std::convert::Infallible;
use std::rc::Rc;

use bytes::Bytes;
use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use http_body_util::{BodyExt, Full};
use hyper::body::Incoming;
use hyper::service::service_fn;
use hyper::{Request, Response};
use runtime_core::Permissions;
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::{mpsc, oneshot};

#[derive(Debug, Serialize)]
pub struct RequestPayload {
    pub id: u64,
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

pub struct PendingResponse {
    pub status: u16,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

type IncomingRequest = (RequestPayload, oneshot::Sender<PendingResponse>);

pub struct ServerHandle {
    accept_rx: Option<mpsc::Receiver<IncomingRequest>>,
    accept_task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub struct HttpState {
    servers: HashMap<u64, ServerHandle>,
    pending: HashMap<(u64, u64), oneshot::Sender<PendingResponse>>,
    next_server_id: u64,
    next_request_id: u64,
}

impl HttpState {
    fn next_server(&mut self) -> u64 {
        self.next_server_id += 1;
        self.next_server_id
    }

    fn next_request(&mut self) -> u64 {
        self.next_request_id += 1;
        self.next_request_id
    }
}

/// Bind listener + spawn accept-loop hyper. Mengembalikan (port aktual, handle).
fn start_server(host: &str, port: u16) -> Result<(u16, ServerHandle), JsErrorBox> {
    let listener = std::net::TcpListener::bind((host, port))
        .map_err(|error| JsErrorBox::generic(format!("gagal bind {host}:{port}: {error}")))?;
    listener
        .set_nonblocking(true)
        .map_err(|error| JsErrorBox::generic(format!("gagal set nonblocking: {error}")))?;
    let actual_port = listener
        .local_addr()
        .map_err(|error| JsErrorBox::generic(error.to_string()))?
        .port();

    let listener = TcpListener::from_std(listener)
        .map_err(|error| JsErrorBox::generic(format!("gagal membuat listener tokio: {error}")))?;

    let (accept_tx, accept_rx) = mpsc::channel::<IncomingRequest>(64);

    let accept_task = tokio::spawn(async move {
        loop {
            let Ok((stream, _remote)) = listener.accept().await else {
                break;
            };

            let accept_tx = accept_tx.clone();
            tokio::spawn(async move {
                let service = service_fn(move |request: Request<Incoming>| {
                    let accept_tx = accept_tx.clone();
                    async move {
                        let method = request.method().to_string();
                        let path = request
                            .uri()
                            .path_and_query()
                            .map(|value| value.to_string())
                            .unwrap_or_else(|| "/".to_string());
                        let headers = request
                            .headers()
                            .iter()
                            .map(|(name, value)| {
                                (name.to_string(), value.to_str().unwrap_or("").to_string())
                            })
                            .collect::<Vec<_>>();
                        let body_bytes = match request.into_body().collect().await {
                            Ok(collected) => collected.to_bytes(),
                            Err(_) => Bytes::new(),
                        };

                        let (respond_tx, respond_rx) = oneshot::channel::<PendingResponse>();
                        let payload = RequestPayload {
                            id: 0, // diisi op_http_accept saat dikirim ke JS
                            method,
                            path,
                            headers,
                            body: String::from_utf8_lossy(&body_bytes).to_string(),
                        };

                        if accept_tx.send((payload, respond_tx)).await.is_err() {
                            return Ok::<_, Infallible>(error_response(503, "server ditutup"));
                        }

                        match respond_rx.await {
                            Ok(pending) => {
                                let mut builder = Response::builder().status(pending.status);
                                for (name, value) in pending.headers {
                                    builder = builder.header(name, value);
                                }
                                let response = builder
                                    .header("connection", "close")
                                    .body(Full::new(Bytes::from(pending.body)))
                                    .unwrap_or_else(|_| error_response(500, "header tidak valid"));
                                Ok(response)
                            }
                            Err(_) => Ok(error_response(503, "respons tidak dikirim")),
                        }
                    }
                });

                let _ = hyper::server::conn::http1::Builder::new()
                    .serve_connection(hyper_util::rt::TokioIo::new(stream), service)
                    .await;
            });
        }
    });

    Ok((
        actual_port,
        ServerHandle {
            accept_rx: Some(accept_rx),
            accept_task,
        },
    ))
}

fn error_response(status: u16, message: &str) -> Response<Full<Bytes>> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(Full::new(Bytes::from(message.to_string())))
        .expect("respons statis valid")
}

// ----- ops (dipanggil dari JS) -------------------------------------------------------------

#[op2]
#[serde]
pub fn op_http_listen(
    state: &mut OpState,
    #[string] host: String,
    #[smi] port: u16,
) -> Result<(u64, u16), JsErrorBox> {
    state
        .borrow::<Permissions>()
        .check_net(&host)
        .map_err(JsErrorBox::generic)?;
    let (actual_port, handle) = start_server(&host, port)?;
    let http = state.borrow_mut::<HttpState>();
    let server_id = http.next_server();
    http.servers.insert(server_id, handle);
    Ok((server_id, actual_port))
}

#[op2(async(lazy), fast)]
#[serde]
pub async fn op_http_accept(
    state: Rc<RefCell<OpState>>,
    #[smi] server_id: u64,
) -> Result<Option<RequestPayload>, JsErrorBox> {
    let mut receiver = {
        let mut op_state = state.borrow_mut();
        let http = op_state.borrow_mut::<HttpState>();
        let Some(server) = http.servers.get_mut(&server_id) else {
            // Server sudah ditutup → akhiri loop accept dengan bersih.
            return Ok(None);
        };
        server
            .accept_rx
            .take()
            .ok_or_else(|| JsErrorBox::generic("accept sudah berjalan untuk server ini"))?
    };

    let received = receiver.recv().await;

    let mut op_state = state.borrow_mut();
    let http = op_state.borrow_mut::<HttpState>();

    // Receiver dikembalikan agar accept berikutnya dapat memakai.
    if let Some(server) = http.servers.get_mut(&server_id) {
        server.accept_rx = Some(receiver);
    } else {
        return Ok(None);
    }

    let Some((mut payload, respond_tx)) = received else {
        return Ok(None);
    };
    payload.id = http.next_request();
    http.pending.insert((server_id, payload.id), respond_tx);
    Ok(Some(payload))
}

#[op2]
pub fn op_http_respond(
    state: &mut OpState,
    #[smi] server_id: u64,
    #[smi] request_id: u64,
    #[smi] status: u16,
    #[serde] headers: Vec<(String, String)>,
    #[string] body: String,
) -> Result<(), JsErrorBox> {
    let http = state.borrow_mut::<HttpState>();
    let sender = http
        .pending
        .remove(&(server_id, request_id))
        .ok_or_else(|| JsErrorBox::generic(format!("request {request_id} tidak pending")))?;
    sender
        .send(PendingResponse {
            status,
            headers,
            body,
        })
        .map_err(|_| JsErrorBox::generic("koneksi sudah tertutup"))
}

#[op2(fast)]
pub fn op_http_close(state: &mut OpState, #[smi] server_id: u64) -> Result<(), JsErrorBox> {
    let http = state.borrow_mut::<HttpState>();
    let server = http
        .servers
        .remove(&server_id)
        .ok_or_else(|| JsErrorBox::generic(format!("server {server_id} tidak ada")))?;
    server.accept_task.abort();
    drop(server.accept_rx);
    Ok(())
}
