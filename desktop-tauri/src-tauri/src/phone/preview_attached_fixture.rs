use super::preview_service::PreviewService;
use serde_json::{json, Value};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc::Receiver, Arc};
use std::thread::JoinHandle;
use std::time::Duration;
use vibyra_host::{PreviewFrame as Frame, PreviewHandler, StreamKey, WINDOW_BYTES};

pub(super) struct Site {
    pub(super) port: u16,
    stopped: Arc<AtomicBool>,
    worker: JoinHandle<()>,
}

impl Site {
    pub(super) fn bind(port: u16, label: &'static str) -> Self {
        let listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        let port = listener.local_addr().unwrap().port();
        listener.set_nonblocking(true).unwrap();
        let stopped = Arc::new(AtomicBool::new(false));
        let done = stopped.clone();
        let worker = std::thread::spawn(move || {
            while !done.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok((mut socket, _)) => serve(&mut socket, port, label),
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(5));
                    }
                    Err(error) => panic!("fixture accept failed: {error}"),
                }
            }
        });
        Self {
            port,
            stopped,
            worker,
        }
    }

    pub(super) fn stop(self) -> u16 {
        self.stopped.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(("127.0.0.1", self.port));
        self.worker.join().unwrap();
        self.port
    }
}

fn serve(socket: &mut TcpStream, port: u16, label: &str) {
    socket
        .set_read_timeout(Some(Duration::from_secs(2)))
        .unwrap();
    let mut request = Vec::new();
    let mut buffer = [0u8; 1024];
    while request.len() < 8192 && !request.ends_with(b"\r\n\r\n") {
        match socket.read(&mut buffer) {
            Ok(0) | Err(_) => return, // The readiness probe opens and closes a socket.
            Ok(count) => request.extend_from_slice(&buffer[..count]),
        }
    }
    let line = String::from_utf8_lossy(&request);
    let path = line.split_whitespace().nth(1).unwrap_or("");
    let (status, headers, body) = match path {
        "/" => ("302 Found", format!("Location: http://127.0.0.1:{port}/menu\r\n"), Vec::new()),
        "/menu" => ("200 OK", "Content-Type: text/html\r\n".into(),
            format!("<h1>{label} menu</h1><link rel=\"stylesheet\" href=\"http://127.0.0.1:{port}/assets/app.css\">").into_bytes()),
        "/assets/app.css" => ("200 OK", "Content-Type: text/css\r\n".into(),
            format!("/* {label} asset */").into_bytes()),
        _ => ("404 Not Found", String::new(), Vec::new()),
    };
    let head = format!(
        "HTTP/1.1 {status}\r\n{headers}Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    socket.write_all(head.as_bytes()).unwrap();
    socket.write_all(&body).unwrap();
}

pub(super) fn request(
    service: &PreviewService,
    receiver: &Receiver<Frame>,
    generation: u64,
    id: u64,
    path: &str,
) -> (Value, Vec<u8>) {
    request_with_headers(service, receiver, generation, id, path, json!({}))
}

pub(super) fn request_with_headers(
    service: &PreviewService,
    receiver: &Receiver<Frame>,
    generation: u64,
    id: u64,
    path: &str,
    headers: Value,
) -> (Value, Vec<u8>) {
    let key = StreamKey::new(id, generation).unwrap();
    service.receive("phone", Frame::Open { key }).unwrap();
    assert!(matches!(
        receiver.recv_timeout(Duration::from_secs(3)).unwrap(),
        Frame::Credit { .. }
    ));
    let metadata = json!({"v":1,"kind":"http","method":"GET","path":path,
        "headers":headers,"browserOrigin":"http://127.0.0.1:55331"})
    .to_string()
    .into_bytes();
    service
        .receive(
            "phone",
            Frame::Data {
                key,
                sequence: 0,
                bytes: metadata,
            },
        )
        .unwrap();
    assert!(matches!(
        receiver.recv_timeout(Duration::from_secs(3)).unwrap(),
        Frame::Credit { .. }
    ));
    service
        .receive("phone", Frame::End { key, sequence: 1 })
        .unwrap();
    assert_eq!(
        receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
        Frame::Open { key }
    );
    service
        .receive(
            "phone",
            Frame::Credit {
                key,
                total: WINDOW_BYTES as u64,
            },
        )
        .unwrap();
    let mut info = None;
    let mut body = Vec::new();
    let mut received = 0usize;
    loop {
        match receiver.recv_timeout(Duration::from_secs(5)).unwrap() {
            Frame::Data {
                key: returned,
                sequence,
                bytes,
            } if returned == key => {
                received += bytes.len();
                if sequence == 0 {
                    info = Some(serde_json::from_slice(&bytes).unwrap());
                } else {
                    body.extend_from_slice(&bytes);
                }
                service
                    .receive(
                        "phone",
                        Frame::Credit {
                            key,
                            total: (WINDOW_BYTES + received) as u64,
                        },
                    )
                    .unwrap();
            }
            Frame::End { key: returned, .. } if returned == key => break,
            other => panic!("unexpected Preview frame: {other:?}"),
        }
    }
    (info.unwrap(), body)
}
