use super::preview_service::PreviewService;
use std::{collections::HashMap, sync::mpsc::Receiver, time::Duration};
use vibyra_host::{
    PreviewFrame as Frame, PreviewHandler, StreamKey, UpgradeRequest, UpgradeResponse, WINDOW_BYTES,
};

pub(super) fn receive(receiver: &Receiver<Frame>) -> Frame {
    receiver.recv_timeout(Duration::from_secs(10)).unwrap()
}

pub(super) fn open_websocket(
    service: &PreviewService,
    receiver: &Receiver<Frame>,
    generation: u64,
) -> StreamKey {
    let key = StreamKey::new(7, generation).unwrap();
    service.receive("phone", Frame::Open { key }).unwrap();
    assert!(matches!(receive(receiver), Frame::Credit { .. }));
    let mut headers = HashMap::new();
    headers.insert("Upgrade".into(), "websocket".into());
    headers.insert("Connection".into(), "Upgrade".into());
    headers.insert("Sec-WebSocket-Version".into(), "13".into());
    headers.insert(
        "Sec-WebSocket-Key".into(),
        "dGhlIHNhbXBsZSBub25jZQ==".into(),
    );
    headers.insert("Origin".into(), "http://127.0.0.1:8000".into());
    let metadata = UpgradeRequest {
        v: 1,
        kind: "upgrade".into(),
        method: "GET".into(),
        path: "/ws".into(),
        headers,
    }
    .encode()
    .unwrap();
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
    let mut opened = false;
    for _ in 0..10 {
        match receive(receiver) {
            Frame::Open { key: value } if value == key => {
                opened = true;
                break;
            }
            Frame::Credit { .. } => {}
            other => panic!("unexpected handshake frame: {other:?}"),
        }
    }
    assert!(opened);
    service
        .receive(
            "phone",
            Frame::Credit {
                key,
                total: WINDOW_BYTES as u64,
            },
        )
        .unwrap();
    let response = match receive(receiver) {
        Frame::Data {
            key: value,
            sequence: 0,
            bytes,
        } if value == key => UpgradeResponse::decode(&bytes).unwrap(),
        other => panic!("unexpected response metadata: {other:?}"),
    };
    assert_eq!(response.status, 101);
    assert_eq!(
        response.headers["sec-websocket-accept"],
        "s3pPLMBiTxaQ9kYGzzhZRbK+xOo="
    );
    key
}
