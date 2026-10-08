use super::*;
use std::io::{Read, Write};
fn server(status: u16, body: String) -> (String, std::thread::JoinHandle<()>) {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let address = listener.local_addr().unwrap();
    let join = std::thread::spawn(move || {
        let (mut stream, _) = listener.accept().unwrap();
        stream
            .set_read_timeout(Some(std::time::Duration::from_secs(5)))
            .unwrap();
        let mut request = Vec::new();
        let mut byte = [0];
        while !request.ends_with(b"\r\n\r\n") {
            if stream.read(&mut byte).unwrap() == 0 {
                return;
            }
            request.push(byte[0]);
        }
        let request = String::from_utf8(request).unwrap();
        assert!(request.starts_with("GET /api/remote/hosts/"));
        assert!(request.contains("after=100") && request.contains("at=101"));
        if status == 0 {
            return;
        }
        let reply=format!("HTTP/1.1 {status} Test\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len());
        stream.write_all(reply.as_bytes()).unwrap();
    });
    (format!("http://{address}"), join)
}
#[tokio::test]
async fn actual_http_auth_rejection_is_distinct_from_offline_old_backend_and_revision_conflict() {
    for status in [0, 401, 403, 404, 409, 500, 200] {
        let (base, join) = server(status, "{}".into());
        let error = fetch_at(&base, "synthetic-token", &"a".repeat(64), 100, Some(101))
            .await
            .unwrap_err();
        assert_eq!(
            error,
            if matches!(status, 401 | 403) {
                Failure::Unauthorized
            } else {
                Failure::Retry
            }
        );
        join.join().unwrap();
    }
}
#[tokio::test]
async fn actual_php_page_survives_http_body_and_strict_rust_decoding() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../../../host/fixtures/remote-controls.json")).unwrap();
    let (base, join) = server(200, fixture["first"].to_string());
    let page = fetch_at(&base, "synthetic-token", &"a".repeat(64), 100, Some(101))
        .await
        .unwrap();
    assert_eq!(page.revision, 101);
    assert!(page.has_more);
    assert_eq!(page.revoked_devices.len(), 100);
    join.join().unwrap();
}
