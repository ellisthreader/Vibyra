use super::*;
use std::io::{Read, Write};
use std::net::TcpListener;

#[test]
fn credentials_only_go_to_https_or_exact_development_loopback() {
    for value in [
        "https://vibyra.app",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ] {
        assert!(validated_base(value).is_ok());
    }
    for value in [
        "http://127.0.0.1.evil.test",
        "http://localhost.evil.test",
        "http://example.test",
        "https://user:password@example.test",
        "https://example.test?token=x",
        "https://example.test/path",
    ] {
        assert!(validated_base(value).is_err());
    }
}

fn endpoint(status: &str, body: &str, extra: &str) -> (String, std::thread::JoinHandle<String>) {
    let server = TcpListener::bind("127.0.0.1:0").unwrap();
    let url = format!("http://{}", server.local_addr().unwrap());
    let response = format!("HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\n{extra}Connection: close\r\n\r\n{body}", body.len());
    let task = std::thread::spawn(move || {
        let (mut socket, _) = server.accept().unwrap();
        socket
            .set_read_timeout(Some(Duration::from_secs(5)))
            .unwrap();
        let mut data = Vec::new();
        let mut block = [0u8; 4096];
        loop {
            let n = socket.read(&mut block).unwrap();
            if n == 0 {
                break;
            }
            data.extend_from_slice(&block[..n]);
            let text = String::from_utf8_lossy(&data);
            if let Some(split) = text.find("\r\n\r\n") {
                let length = text[..split]
                    .lines()
                    .find_map(|line| {
                        line.to_lowercase()
                            .strip_prefix("content-length: ")
                            .and_then(|v| v.parse::<usize>().ok())
                    })
                    .unwrap_or(0);
                if data.len() >= split + 4 + length {
                    break;
                }
            }
        }
        socket.write_all(response.as_bytes()).unwrap();
        String::from_utf8(data).unwrap()
    });
    (url, task)
}

#[tokio::test]
async fn keyless_client_sends_only_vibyra_session_and_payload_to_gateway() {
    let (base, receipt) = endpoint("200 OK", "{\"text\":\"Hello\"}", "");
    let body =
        serde_json::json!({"audio": "synthetic", "requestId": uuid::Uuid::new_v4().to_string()});
    let response = request_at(
        &base,
        Method::POST,
        "transcriptions",
        "vibyra-test-session",
        Some(body),
    )
    .await
    .unwrap();
    assert_eq!(response.json::<Value>().await.unwrap()["text"], "Hello");
    let request = receipt.join().unwrap();
    assert!(request.starts_with("POST /api/assistant/transcriptions "));
    assert!(request
        .to_lowercase()
        .contains("authorization: bearer vibyra-test-session"));
    assert!(!request.contains("OPENAI_API_KEY") && !request.contains("api.openai.com"));
}

#[tokio::test]
async fn redirects_never_forward_the_session() {
    let target = TcpListener::bind("127.0.0.1:0").unwrap();
    target.set_nonblocking(true).unwrap();
    let (base, receipt) = endpoint(
        "307 Temporary Redirect",
        "{}",
        &format!(
            "Location: http://{}/stolen\r\n",
            target.local_addr().unwrap()
        ),
    );
    assert!(
        request_at(&base, Method::GET, "status", "vibyra-test-session", None)
            .await
            .is_err()
    );
    receipt.join().unwrap();
    assert!(target.accept().is_err());
}

#[tokio::test]
async fn token_exhaustion_reports_public_message_without_session_teardown() {
    let (base, receipt) = endpoint(
        "402 Payment Required",
        "{\"error\":\"You need more Vibyra tokens.\"}",
        "",
    );
    let error = request_at(&base, Method::GET, "status", "vibyra-test-session", None)
        .await
        .err()
        .unwrap();
    assert_eq!(error, "You need more Vibyra tokens.");
    receipt.join().unwrap();
}
