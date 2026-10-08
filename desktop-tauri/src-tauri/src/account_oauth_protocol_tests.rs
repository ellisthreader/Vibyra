use super::{request_raw_at, Endpoint};
use crate::account_oauth_start::start_body;
use std::io::{Read, Write};
use std::net::TcpListener;

#[test]
fn oauth_start_and_claim_follow_the_bound_backend_protocol() {
    let (secret, body) = start_body("Test device", "test-install").unwrap();
    let (other, _) = start_body("Test device", "test-install").unwrap();
    assert_eq!(secret.len(), 64);
    assert!(secret.bytes().all(|byte| byte.is_ascii_hexdigit()));
    assert_ne!(secret, other);
    assert_eq!(body["flowSecret"], secret);
    assert_eq!(body["installId"], "test-install");
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let flow = "f".repeat(64);
    let expected = secret.clone();
    let expected_flow = flow.clone();
    let server = std::thread::spawn(move || {
        for attempt in 0..5 {
            let (mut socket, _) = listener.accept().unwrap();
            socket
                .set_read_timeout(Some(std::time::Duration::from_secs(5)))
                .unwrap();
            let mut bytes = Vec::new();
            let (headers, payload) = loop {
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
                                .and_then(|value| value.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if payload.len() >= length {
                        break (headers.to_owned(), payload.to_owned());
                    }
                }
            };
            let first = headers.lines().next().unwrap();
            assert!(!first.contains(&expected), "proof must not enter the URL");
            let proof = headers.lines().find_map(|line| {
                line.split_once(':')
                    .filter(|(name, _)| name.eq_ignore_ascii_case("X-Vibyra-Flow-Secret"))
                    .map(|(_, value)| value.trim())
            });
            let (status, response) = if attempt == 0 {
                assert_eq!(first, "POST /api/auth/desktop/google/start HTTP/1.1");
                assert_eq!(
                    serde_json::from_str::<serde_json::Value>(&payload).unwrap()["flowSecret"],
                    expected
                );
                assert_eq!(proof, None);
                (200, r#"{"ok":true,"status":"pending"}"#)
            } else {
                assert_eq!(
                    first,
                    format!("GET /api/auth/desktop/google/status/{expected_flow} HTTP/1.1")
                );
                assert!(payload.is_empty());
                match attempt {
                    1 | 2 => {
                        assert_ne!(proof, Some(expected.as_str()));
                        (403, r#"{"status":"forbidden"}"#)
                    }
                    3 => {
                        assert_eq!(proof, Some(expected.as_str()));
                        (200, r#"{"status":"complete","token":"fixture"}"#)
                    }
                    _ => {
                        assert_eq!(proof, Some(expected.as_str()));
                        (410, r#"{"status":"expired"}"#)
                    }
                }
            };
            write!(socket, "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}", response.len()).unwrap();
        }
    });
    tauri::async_runtime::block_on(async {
        assert_eq!(
            request_raw_at(
                &base,
                Endpoint::OauthStart("google"),
                None,
                Some(body),
                None
            )
            .await
            .unwrap()
            .0,
            200
        );
        for (proof, status, state) in [
            (None, 403, "forbidden"),
            (Some(other.as_str()), 403, "forbidden"),
            (Some(secret.as_str()), 200, "complete"),
            (Some(secret.as_str()), 410, "expired"),
        ] {
            let response = request_raw_at(
                &base,
                Endpoint::OauthStatus("google", &flow),
                None,
                None,
                proof,
            )
            .await
            .unwrap();
            assert_eq!(response.0, status);
            assert_eq!(response.1["status"], state);
        }
    });
    server.join().unwrap();
}
