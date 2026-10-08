use super::{request_raw_at, Endpoint};
use crate::account_oauth_start::start_body;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::{
    atomic::{AtomicBool, AtomicUsize, Ordering},
    Arc,
};

fn read_request(socket: &mut TcpStream) {
    socket
        .set_read_timeout(Some(std::time::Duration::from_secs(5)))
        .unwrap();
    let mut bytes = Vec::new();
    loop {
        let mut chunk = [0; 4096];
        let count = socket.read(&mut chunk).unwrap();
        assert!(count > 0);
        bytes.extend_from_slice(&chunk[..count]);
        let text = String::from_utf8_lossy(&bytes);
        if let Some((headers, payload)) = text.split_once("\r\n\r\n") {
            let length = headers
                .lines()
                .find_map(|line| {
                    line.to_lowercase()
                        .strip_prefix("content-length:")
                        .and_then(|n| n.trim().parse::<usize>().ok())
                })
                .unwrap_or(0);
            if payload.len() >= length {
                return;
            }
        }
    }
}

#[test]
fn oauth_never_forwards_start_body_or_poll_proof_to_a_redirect_target() {
    let target = TcpListener::bind("127.0.0.1:0").unwrap();
    let destination = format!("http://{}/steal", target.local_addr().unwrap());
    target.set_nonblocking(true).unwrap();
    let done = Arc::new(AtomicBool::new(false));
    let received = Arc::new(AtomicUsize::new(0));
    let (finished, requests) = (done.clone(), received.clone());
    let sink = std::thread::spawn(move || {
        while !finished.load(Ordering::SeqCst) {
            match target.accept() {
                Ok((mut socket, _)) => {
                    read_request(&mut socket);
                    requests.fetch_add(1, Ordering::SeqCst);
                    write!(
                        socket,
                        "HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}"
                    )
                    .unwrap();
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(std::time::Duration::from_millis(5));
                }
                Err(e) => panic!("{e}"),
            }
        }
    });
    let source = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", source.local_addr().unwrap());
    let redirector = std::thread::spawn(move || {
        for status in [302, 307, 302, 307] {
            let (mut socket, _) = source.accept().unwrap();
            read_request(&mut socket);
            write!(socket, "HTTP/1.1 {status} Redirect\r\nLocation: {destination}\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{{}}").unwrap();
        }
    });
    let (secret, body) = start_body("Test device", "test-install").unwrap();
    let flow = "f".repeat(64);
    let observed = tauri::async_runtime::block_on(async {
        let mut statuses = Vec::new();
        for _ in 0..2 {
            statuses.push(
                request_raw_at(
                    &base,
                    Endpoint::OauthStart("google"),
                    None,
                    Some(body.clone()),
                    None,
                )
                .await
                .unwrap()
                .0,
            );
        }
        for _ in 0..2 {
            statuses.push(
                request_raw_at(
                    &base,
                    Endpoint::OauthStatus("google", &flow),
                    None,
                    None,
                    Some(&secret),
                )
                .await
                .unwrap()
                .0,
            );
        }
        statuses
    });
    redirector.join().unwrap();
    done.store(true, Ordering::SeqCst);
    sink.join().unwrap();
    assert_eq!(observed, [302, 307, 302, 307]);
    assert_eq!(
        received.load(Ordering::SeqCst),
        0,
        "redirect destination must receive no request"
    );
}
