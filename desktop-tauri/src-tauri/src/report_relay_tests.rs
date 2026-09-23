use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::thread;
use std::time::{Duration, Instant};

use super::{deliver_at, ready_at};
use crate::discord::Attachment;
use crate::report::{Report, ReportContext};
use crate::report_privacy::redact_unapproved_diagnostics;

fn receive(mut stream: TcpStream, readiness_available: bool) -> String {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .unwrap();
    let mut bytes = Vec::new();
    let header_end = loop {
        let mut chunk = [0_u8; 8192];
        let count = stream.read(&mut chunk).unwrap();
        assert!(count > 0, "request ended before headers");
        bytes.extend_from_slice(&chunk[..count]);
        if let Some(index) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
            break index + 4;
        }
    };
    let headers = String::from_utf8_lossy(&bytes[..header_end]).to_ascii_lowercase();
    let length = headers
        .lines()
        .find_map(|line| line.strip_prefix("content-length: "))
        .and_then(|value| value.trim().parse::<usize>().ok())
        .unwrap_or(0);
    while bytes.len() < header_end + length {
        let mut chunk = [0_u8; 8192];
        let count = stream.read(&mut chunk).unwrap();
        assert!(count > 0, "request ended before body");
        bytes.extend_from_slice(&chunk[..count]);
    }
    let request = String::from_utf8_lossy(&bytes).into_owned();
    let reply = if request.starts_with("GET ") && !readiness_available {
        r#"{"ok":false,"error":"Temporary failure"}"#
    } else if request.starts_with("GET ") {
        r#"{"ok":true,"ready":true}"#
    } else {
        r#"{"ok":true,"id":"VR-TEST01"}"#
    };
    let status = if request.starts_with("GET ") && !readiness_available {
        "503 Service Unavailable"
    } else {
        "200 OK"
    };
    let response = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{reply}",
        reply.len()
    );
    stream.write_all(response.as_bytes()).unwrap();
    request
}

#[test]
fn authenticated_ready_and_report_multipart_match_the_live_api_contract() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    listener.set_nonblocking(true).unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || {
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut requests = Vec::new();
        while requests.len() < 3 && Instant::now() < deadline {
            match listener.accept() {
                Ok((stream, _)) => requests.push(receive(stream, true)),
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10));
                }
                Err(error) => panic!("local server failed: {error}"),
            }
        }
        requests
    });
    let mut report = Report {
        kind: "bug".into(),
        severity: "high".into(),
        summary: "The terminal missed my key".into(),
        details: "The second character arrived late".into(),
        context: ReportContext {
            app_version: "0.8.1".into(),
            platform: "linux".into(),
            reporter: Some("private@example.com".into()),
            project_root: Some("/home/private/work".into()),
            ..ReportContext::default()
        },
        screenshot: Some("private-data-url".into()),
        image_paths: vec!["/home/private/image.png".into()],
        session_id: Some(42),
        ..Report::default()
    };
    tauri::async_runtime::block_on(async {
        assert_eq!(ready_at(&base, "test-token").await, Ok(true));
        redact_unapproved_diagnostics(&mut report);
        assert_eq!(
            deliver_at(&base, "test-token", &report, None, vec![], None)
                .await
                .unwrap(),
            "VR-TEST01"
        );
        report.include_diagnostics = true;
        report.context.reporter = Some("private@example.com".into());
        let picture = Attachment {
            file_name: "evidence.png".into(),
            mime: "image/png",
            bytes: vec![137, 80, 78, 71],
        };
        assert_eq!(
            deliver_at(
                &base,
                "test-token",
                &report,
                Some(vec![137, 80, 78, 71]),
                vec![picture],
                Some("opted-in terminal tail".into()),
            )
            .await
            .unwrap(),
            "VR-TEST01"
        );
    });
    let requests = server.join().unwrap();
    assert_eq!(requests.len(), 3);
    for request in &requests {
        assert!(request
            .to_ascii_lowercase()
            .contains("authorization: bearer test-token"));
    }
    assert!(requests[0].starts_with("GET /api/reports/ready "));
    assert!(requests[1].starts_with("POST /api/reports "));
    assert!(requests[1].contains("name=\"report\""));
    assert!(requests[1].contains("\"includeDiagnostics\":false"));
    for secret in [
        "private@example.com",
        "/home/private/work",
        "private-data-url",
        "/home/private/image.png",
        "\"sessionId\"",
        "terminalTail",
    ] {
        assert!(
            !requests[1].contains(secret),
            "unapproved field leaked: {secret}"
        );
    }
    assert!(requests[2].contains("\"includeDiagnostics\":true"));
    assert!(requests[2].contains("private@example.com"));
    assert!(requests[2].contains("name=\"terminalTail\""));
    assert!(requests[2].contains("opted-in terminal tail"));
    assert!(requests[2].contains("name=\"screenshot\""));
    assert!(requests[2].contains("name=\"images[]\""));
}

#[test]
fn failed_readiness_is_not_a_false_channel_disabled_result() {
    let listener = TcpListener::bind("127.0.0.1:0").unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = thread::spawn(move || receive(listener.accept().unwrap().0, false));
    tauri::async_runtime::block_on(async {
        assert!(ready_at(&base, "test-token").await.is_err());
    });
    assert!(server.join().unwrap().starts_with("GET /api/reports/ready"));
}
