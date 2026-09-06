mod support;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde_json::json;
use std::{
    io::{Read, Write},
    net::TcpListener,
};
use support::Harness;

fn server(response: &'static [u8]) -> (u16, std::thread::JoinHandle<()>) {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let port = listener.local_addr().unwrap().port();
    let worker = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut request = [0; 4096];
        assert!(stream.read(&mut request).unwrap() > 0);
        stream.write_all(response).unwrap();
    });
    (port, worker)
}

#[test]
fn preview_requires_local_port_approval_and_returns_actual_loopback_page() {
    let host = Harness::new();
    let (port, worker) = server(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 13\r\nConnection: close\r\n\r\n<h1>Test</h1>");
    let params = json!({"projectId":host.project,"port":port,"path":"/"});
    assert!(host
        .engine
        .handle("phone-a", "preview.fetch", params.clone())
        .is_err());
    host.engine.allow_preview(&host.project, port).unwrap();
    let result = host
        .engine
        .handle("phone-a", "preview.fetch", params)
        .unwrap();
    assert_eq!(result["status"], 200);
    assert_eq!(
        STANDARD.decode(result["body"].as_str().unwrap()).unwrap(),
        b"<h1>Test</h1>"
    );
    worker.join().unwrap();
}

#[test]
fn preview_rejects_cross_origin_paths_and_does_not_follow_redirects() {
    let host = Harness::new();
    let (port, worker) = server(b"HTTP/1.1 302 Found\r\nLocation: http://example.invalid/secret\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    host.engine.allow_preview("Test", port).unwrap();
    for path in [
        "//example.invalid/secret",
        "http://example.invalid/",
        "/\\example.invalid/",
        "/\r\nHost: example.invalid",
    ] {
        assert!(host
            .engine
            .handle(
                "phone-a",
                "preview.fetch",
                json!({"projectId":host.project,"port":port,"path":path})
            )
            .is_err());
    }
    assert!(host
        .engine
        .handle(
            "phone-a",
            "preview.fetch",
            json!({"projectId":host.project,"port":port,"path":"/"})
        )
        .is_err());
    worker.join().unwrap();
}
