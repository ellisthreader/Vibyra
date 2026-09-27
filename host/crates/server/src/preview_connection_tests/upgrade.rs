use super::*;
use crate::preview_upgrade::{UpgradeRequest, UpgradeResponse};
use std::collections::HashMap;

#[tokio::test]
async fn authenticated_upgrade_carries_opaque_bytes_in_both_directions_without_request_end() {
    let (backend, probe) = TestBackend::new(true);
    let mut connected = connect(backend).await;
    let key = StreamKey::new(51, 63).unwrap();
    let request = UpgradeRequest {
        v: 1,
        kind: "upgrade".into(),
        method: "GET".into(),
        path: "/@vite/client".into(),
        headers: HashMap::from([
            ("Upgrade".into(), "websocket".into()),
            ("Connection".into(), "Upgrade".into()),
            ("Sec-WebSocket-Version".into(), "13".into()),
            (
                "Sec-WebSocket-Key".into(),
                "dGhlIHNhbXBsZSBub25jZQ==".into(),
            ),
        ]),
    };
    let response = UpgradeResponse {
        v: 1,
        status: 101,
        headers: HashMap::from([
            ("Upgrade".into(), "websocket".into()),
            ("Connection".into(), "Upgrade".into()),
            (
                "Sec-WebSocket-Accept".into(),
                "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=".into(),
            ),
        ]),
    };
    let phone_bytes = vec![0x81, 0x80, 0, 0, 0, 0];
    let mac_bytes = vec![0x81, 0x01, b'x'];

    send(&mut connected, &Frame::Open { key }.encode().unwrap()).await;
    send(
        &mut connected,
        &Frame::Data {
            key,
            sequence: 0,
            bytes: request.encode().unwrap(),
        }
        .encode()
        .unwrap(),
    )
    .await;
    send(
        &mut connected,
        &Frame::Data {
            key,
            sequence: 1,
            bytes: phone_bytes.clone(),
        }
        .encode()
        .unwrap(),
    )
    .await;
    tokio::time::timeout(Duration::from_secs(2), async {
        loop {
            let received = probe.received.lock().unwrap().clone();
            if received
                .iter()
                .any(|frame| matches!(frame, Frame::Data { sequence: 1, .. }))
            {
                assert!(received
                    .iter()
                    .all(|frame| !matches!(frame, Frame::End { .. })));
                assert_eq!(
                    UpgradeRequest::decode(match &received[1] {
                        Frame::Data { bytes, .. } => bytes,
                        _ => panic!("expected metadata"),
                    })
                    .unwrap(),
                    request
                );
                assert_eq!(
                    received[2],
                    Frame::Data {
                        key,
                        sequence: 1,
                        bytes: phone_bytes
                    }
                );
                break;
            }
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();

    probe.sent.send(Frame::Open { key }).unwrap();
    probe
        .sent
        .send(Frame::Data {
            key,
            sequence: 0,
            bytes: response.encode().unwrap(),
        })
        .unwrap();
    probe
        .sent
        .send(Frame::Data {
            key,
            sequence: 1,
            bytes: mac_bytes.clone(),
        })
        .unwrap();
    assert_eq!(
        Frame::decode(&next(&mut connected).await).unwrap(),
        Frame::Open { key }
    );
    let metadata = Frame::decode(&next(&mut connected).await).unwrap();
    let Frame::Data {
        sequence: 0, bytes, ..
    } = metadata
    else {
        panic!("expected 101 metadata")
    };
    assert_eq!(UpgradeResponse::decode(&bytes).unwrap(), response);
    assert_eq!(
        Frame::decode(&next(&mut connected).await).unwrap(),
        Frame::Data {
            key,
            sequence: 1,
            bytes: mac_bytes
        }
    );

    send(
        &mut connected,
        br#"{"id":"terminal","method":"host.state"}"#,
    )
    .await;
    let reply: Value = serde_json::from_slice(&next(&mut connected).await).unwrap();
    assert_eq!(reply["id"], "terminal");
    connected.task.abort();
}
