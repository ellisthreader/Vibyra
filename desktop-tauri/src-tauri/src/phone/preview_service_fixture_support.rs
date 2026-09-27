//! A managed PHP backend proves forms, cookies, redirects, SSE and bulk assets.
use super::preview_service::PreviewService;
use serde_json::{json, Value};
use std::{collections::HashMap, time::Duration};
use vibyra_host::{PreviewFrame as Frame, PreviewHandler, StreamKey, WINDOW_BYTES};

pub(super) const SITE: &str = r#"<?php
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/') {
  header('Content-Type: text/html');
  setcookie('preview_csrf', 'fixture-token', ['path'=>'/', 'samesite'=>'Lax']);
  echo '<form method="post" action="/submit"><input name="csrf" value="fixture-token"><input name="value" value="changed"></form>';
} elseif ($path === '/submit' && $_SERVER['REQUEST_METHOD'] === 'POST') {
  if (($_COOKIE['preview_csrf'] ?? '') !== 'fixture-token' || ($_POST['csrf'] ?? '') !== 'fixture-token') {
    http_response_code(403); echo 'CSRF check failed'; exit;
  }
  file_put_contents(__DIR__.'/saved.txt', $_POST['value'] ?? '');
  header('Set-Cookie: preview_session=fixture; HttpOnly; Path=/', false);
  header('Set-Cookie: preview_preference=mobile; Path=/', false);
  header('Location: /page', true, 303);
} elseif ($path === '/page') {
  echo 'saved='.file_get_contents(__DIR__.'/saved.txt');
} elseif ($path === '/events') {
  header('Content-Type: text/event-stream');
  header('Cache-Control: no-store');
  echo "data: connected\n\n"; flush(); usleep(150000);
  echo "data: updated\n\n"; flush();
} elseif ($path === '/assets/large') {
  header('Content-Type: application/octet-stream');
  header('Content-Length: 10485760');
  for ($i = 0; $i < 640; $i++) echo str_repeat('Z', 16384);
} else { http_response_code(404); }
"#;

pub(super) struct Reply {
    pub(super) info: Value,
    pub(super) body: Vec<u8>,
}

pub(super) fn request(
    service: &PreviewService,
    receiver: &std::sync::mpsc::Receiver<Frame>,
    generation: u64,
    id: u64,
    input: (&str, &str, HashMap<String, String>, &[u8]),
) -> Reply {
    let (method, path, headers, body) = input;
    let key = StreamKey::new(id, generation).unwrap();
    service.receive("phone", Frame::Open { key }).unwrap();
    assert!(matches!(
        receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
        Frame::Credit { .. }
    ));
    let meta = json!({"v":1,"kind":"http","method":method,"path":path,"headers":headers})
        .to_string()
        .into_bytes();
    service
        .receive(
            "phone",
            Frame::Data {
                key,
                sequence: 0,
                bytes: meta,
            },
        )
        .unwrap();
    assert!(matches!(
        receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
        Frame::Credit { .. }
    ));
    let end_sequence = if body.is_empty() {
        1
    } else {
        service
            .receive(
                "phone",
                Frame::Data {
                    key,
                    sequence: 1,
                    bytes: body.to_vec(),
                },
            )
            .unwrap();
        assert!(matches!(
            receiver.recv_timeout(Duration::from_secs(5)).unwrap(),
            Frame::Credit { .. }
        ));
        2
    };
    service
        .receive(
            "phone",
            Frame::End {
                key,
                sequence: end_sequence,
            },
        )
        .unwrap();
    assert_eq!(
        receiver.recv_timeout(Duration::from_secs(10)).unwrap(),
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
    let mut answer = Vec::new();
    let mut total = 0usize;
    loop {
        match receiver.recv_timeout(Duration::from_secs(20)).unwrap() {
            Frame::Data {
                key: returned,
                sequence,
                bytes,
            } if returned == key => {
                total += bytes.len();
                if sequence == 0 {
                    info = Some(serde_json::from_slice(&bytes).unwrap());
                } else {
                    answer.extend_from_slice(&bytes);
                }
                service
                    .receive(
                        "phone",
                        Frame::Credit {
                            key,
                            total: (WINDOW_BYTES + total) as u64,
                        },
                    )
                    .unwrap();
            }
            Frame::End { key: returned, .. } if returned == key => break,
            other => panic!("unexpected response frame: {other:?}"),
        }
    }
    Reply {
        info: info.unwrap(),
        body: answer,
    }
}
