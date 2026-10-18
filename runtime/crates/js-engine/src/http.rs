//! HTTP server minimal untuk runtime (R2): model **pull** — JS memanggil `op_http_accept`
//! berulang dan `op_http_respond` untuk tiap request; Rust tidak pernah memanggil masuk ke V8.
//!
//! Cakupan R2a/R2b: body di-buffer penuh (streaming menyusul), **keep-alive menyala**,
//! **cancellation** saat klien putus (deteksi EOF via `ObservedIo` + `op_http_watch`).

use std::cell::RefCell;
use std::collections::HashMap;
use std::convert::Infallible;
use std::pin::Pin;
use std::rc::Rc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::task::{Context, Poll};
use std::time::Duration;

use bytes::Bytes;
use deno_core::{OpState, op2};
use deno_error::JsErrorBox;
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Full, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::service::service_fn;
use hyper::{Request, Response};
use runtime_core::Permissions;
use serde::Serialize;
use tokio::net::TcpListener;
use tokio::sync::{Notify, mpsc, oneshot};
use tokio_stream::wrappers::ReceiverStream;

/// IO wrapper yang menandai EOF dari klien (koneksi putus) agar handler bisa dibatalkan.
struct ObservedIo {
    inner: tokio::net::TcpStream,
    disconnected: Arc<AtomicBool>,
    notify: Arc<Notify>,
}

impl ObservedIo {
    fn new(stream: tokio::net::TcpStream) -> (Self, Arc<AtomicBool>, Arc<Notify>) {
        let disconnected = Arc::new(AtomicBool::new(false));
        let notify = Arc::new(Notify::new());
        (
            Self {
                inner: stream,
                disconnected: disconnected.clone(),
                notify: notify.clone(),
            },
            disconnected,
            notify,
        )
    }
}

impl tokio::io::AsyncRead for ObservedIo {
    fn poll_read(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &mut tokio::io::ReadBuf<'_>,
    ) -> Poll<std::io::Result<()>> {
        let filled_before = buf.filled().len();
        let result = Pin::new(&mut self.inner).poll_read(cx, buf);
        if let Poll::Ready(Ok(())) = &result
            && buf.filled().len() == filled_before
        {
            self.disconnected.store(true, Ordering::SeqCst);
            self.notify.notify_waiters();
        }
        result
    }
}

impl tokio::io::AsyncWrite for ObservedIo {
    fn poll_write(
        mut self: Pin<&mut Self>,
        cx: &mut Context<'_>,
        buf: &[u8],
    ) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.inner).poll_write(cx, buf)
    }

    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }

    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

#[derive(Debug, Serialize)]
pub struct RequestPayload {
    pub id: u64,
    pub method: String,
    pub path: String,
    pub headers: Vec<(String, String)>,
    pub body: String,
}

/// Respons yang dikirim ke hyper: penuh (buffered) atau streaming chunked.
pub enum ResponseOutcome {
    Full {
        status: u16,
        headers: Vec<(String, String)>,
        body: String,
    },
    Stream {
        status: u16,
        headers: Vec<(String, String)>,
        chunks: mpsc::Receiver<Result<Frame<Bytes>, JsErrorBox>>,
    },
}

/// Entri pending per request: respons buffered (oneshot) atau stream chunked (mpsc).
enum PendingEntry {
    Buffered(oneshot::Sender<ResponseOutcome>),
    Streaming(mpsc::Sender<Result<Frame<Bytes>, JsErrorBox>>),
}

impl PendingEntry {
    fn is_closed(&self) -> bool {
        match self {
            Self::Buffered(sender) => sender.is_closed(),
            Self::Streaming(sender) => sender.is_closed(),
        }
    }
}

type ServiceBody = BoxBody<Bytes, JsErrorBox>;

type IncomingRequest = (RequestPayload, oneshot::Sender<ResponseOutcome>);

pub struct ServerHandle {
    accept_rx: Option<mpsc::Receiver<IncomingRequest>>,
    accept_task: tokio::task::JoinHandle<()>,
}

#[derive(Default)]
pub struct HttpState {
    servers: HashMap<u64, ServerHandle>,
    pending: HashMap<(u64, u64), PendingEntry>,
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
                let (io, disconnected, notify) = ObservedIo::new(stream);
                let service = service_fn(move |request: Request<Incoming>| {
                    let accept_tx = accept_tx.clone();
                    let disconnected = disconnected.clone();
                    let notify = notify.clone();
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

                        let (respond_tx, respond_rx) = oneshot::channel::<ResponseOutcome>();
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

                        // Loop: daftarkan `notified` DULU, baru cek flag (menghindari race notify_waiters
                        // yang tidak menyimpan permit).
                        let mut respond_rx = respond_rx;
                        loop {
                            let notified = notify.notified();
                            if disconnected.load(Ordering::SeqCst) {
                                // Klien sudah pergi sebelum handler selesai → batalkan (drop respond_rx).
                                return Ok(error_response(499, "klien terputus"));
                            }

                            tokio::select! {
                                result = &mut respond_rx => {
                                    return match result {
                                        Ok(outcome) => {
                                            let (status, headers) = match &outcome {
                                                ResponseOutcome::Full { status, headers, .. } => (*status, headers.clone()),
                                                ResponseOutcome::Stream { status, headers, .. } => (*status, headers.clone()),
                                            };
                                            let mut builder = Response::builder().status(status);
                                            for (name, value) in headers {
                                                builder = builder.header(name, value);
                                            }
                                            let body: ServiceBody = match outcome {
                                                ResponseOutcome::Full { body, .. } => Full::new(Bytes::from(body))
                                                    .map_err(|never: Infallible| -> JsErrorBox { match never {} })
                                                    .boxed(),
                                                ResponseOutcome::Stream { chunks, .. } => {
                                                    // Transfer-Encoding: chunked dikelola hyper.
                                                    StreamBody::new(ReceiverStream::new(chunks)).boxed()
                                                }
                                            };
                                            let response = builder
                                                .body(body)
                                                .unwrap_or_else(|_| error_response(500, "header tidak valid"));
                                            Ok(response)
                                        }
                                        Err(_) => Ok(error_response(503, "respons tidak dikirim")),
                                    };
                                }
                                _ = notified => {
                                    // EOF terdeteksi → ulangi loop untuk memeriksa flag.
                                }
                            }
                        }
                    }
                });

                let _ = hyper::server::conn::http1::Builder::new()
                    .serve_connection(hyper_util::rt::TokioIo::new(io), service)
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

fn error_response(status: u16, message: &str) -> Response<ServiceBody> {
    Response::builder()
        .status(status)
        .header("content-type", "text/plain; charset=utf-8")
        .body(
            Full::new(Bytes::from(message.to_string()))
                .map_err(|never: Infallible| -> JsErrorBox { match never {} })
                .boxed(),
        )
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
    http.pending
        .insert((server_id, payload.id), PendingEntry::Buffered(respond_tx));
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
    let Some(entry) = http.pending.remove(&(server_id, request_id)) else {
        return Err(JsErrorBox::generic(format!(
            "request {request_id} tidak pending"
        )));
    };
    let PendingEntry::Buffered(sender) = entry else {
        return Err(JsErrorBox::generic(
            "respons stream sudah dimulai untuk request ini",
        ));
    };
    if sender.is_closed() {
        // Klien sudah pergi (abort); bukan error — server tetap hidup.
        return Ok(());
    }
    sender
        .send(ResponseOutcome::Full {
            status,
            headers,
            body,
        })
        .map_err(|_| JsErrorBox::generic("koneksi sudah tertutup"))
}

/// Mulai respons streaming: kirim status+header ke hyper, lalu chunk dikirim
/// lewat `op_http_stream_chunk` sampai `op_http_stream_end`.
#[op2]
pub fn op_http_stream_start(
    state: &mut OpState,
    #[smi] server_id: u64,
    #[smi] request_id: u64,
    #[smi] status: u16,
    #[serde] headers: Vec<(String, String)>,
) -> Result<(), JsErrorBox> {
    let http = state.borrow_mut::<HttpState>();
    let Some(entry) = http.pending.remove(&(server_id, request_id)) else {
        return Err(JsErrorBox::generic(format!(
            "request {request_id} tidak pending"
        )));
    };
    let PendingEntry::Buffered(sender) = entry else {
        return Err(JsErrorBox::generic(
            "respons stream sudah dimulai untuk request ini",
        ));
    };

    if sender.is_closed() {
        return Ok(()); // klien sudah pergi — tidak ada yang dikirim
    }

    let (chunk_tx, chunk_rx) = mpsc::channel::<Result<Frame<Bytes>, JsErrorBox>>(8);
    sender
        .send(ResponseOutcome::Stream {
            status,
            headers,
            chunks: chunk_rx,
        })
        .map_err(|_| JsErrorBox::generic("koneksi sudah tertutup"))?;

    http.pending
        .insert((server_id, request_id), PendingEntry::Streaming(chunk_tx));
    Ok(())
}

/// Kirim satu chunk (dengan backpressure via `await`).
#[op2(async(lazy), fast)]
pub async fn op_http_stream_chunk(
    state: Rc<RefCell<OpState>>,
    #[smi] server_id: u64,
    #[smi] request_id: u64,
    #[string] chunk: String,
) -> Result<(), JsErrorBox> {
    let sender = {
        let op_state = state.borrow();
        let http = op_state.borrow::<HttpState>();
        match http.pending.get(&(server_id, request_id)) {
            Some(PendingEntry::Streaming(sender)) => sender.clone(),
            Some(PendingEntry::Buffered(_)) => {
                return Err(JsErrorBox::generic("respons belum streaming"));
            }
            None => return Err(JsErrorBox::generic("request tidak pending")),
        }
    };

    sender
        .send(Ok(Frame::data(Bytes::from(chunk))))
        .await
        .map_err(|_| JsErrorBox::generic("klien terputus saat streaming"))
}

/// Akhiri respons streaming (idempoten).
#[op2(fast)]
pub fn op_http_stream_end(
    state: &mut OpState,
    #[smi] server_id: u64,
    #[smi] request_id: u64,
) -> Result<(), JsErrorBox> {
    let http = state.borrow_mut::<HttpState>();
    http.pending.remove(&(server_id, request_id));
    Ok(())
}

/// Menunggu klien putus untuk request yang sedang diproses: `true` bila koneksi klien tertutup
/// sebelum respons dikirim; `false` bila request sudah selesai/respond (entry pending hilang).
#[op2(async(lazy), fast)]
pub async fn op_http_watch(
    state: Rc<RefCell<OpState>>,
    #[smi] server_id: u64,
    #[smi] request_id: u64,
) -> Result<bool, JsErrorBox> {
    loop {
        {
            let op_state = state.borrow();
            let http = op_state.borrow::<HttpState>();
            match http.pending.get(&(server_id, request_id)) {
                Some(sender) => {
                    if sender.is_closed() {
                        return Ok(true);
                    }
                }
                None => return Ok(false),
            }
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
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
