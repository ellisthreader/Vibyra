use super::*;

fn request() -> UpgradeRequest {
    UpgradeRequest {
        v: 1,
        kind: "upgrade".into(),
        method: "GET".into(),
        path: "/@vite/client?token=abc".into(),
        headers: HashMap::from([
            ("Upgrade".into(), "websocket".into()),
            ("Connection".into(), "keep-alive, Upgrade".into()),
            ("Sec-WebSocket-Version".into(), "13".into()),
            (
                "Sec-WebSocket-Key".into(),
                "dGhlIHNhbXBsZSBub25jZQ==".into(),
            ),
        ]),
    }
}

fn response() -> UpgradeResponse {
    UpgradeResponse {
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
    }
}

#[test]
fn upgrade_metadata_is_one_bounded_first_data_chunk() {
    let request = request();
    let encoded = request.encode().unwrap();
    assert!(encoded.len() <= MAX_CHUNK);
    assert_eq!(UpgradeRequest::decode(&encoded).unwrap(), request);
    let response = response();
    let encoded = response.encode().unwrap();
    assert_eq!(UpgradeResponse::decode(&encoded).unwrap(), response);
    assert!(UpgradeRequest::decode(&vec![b'x'; MAX_CHUNK + 1]).is_err());
    assert!(UpgradeResponse::decode(&vec![b'x'; MAX_CHUNK + 1]).is_err());
}

#[test]
fn upgrade_metadata_rejects_origin_escape_and_header_smuggling() {
    for path in [
        "https://elsewhere.test",
        "//elsewhere.test/",
        "/a\\b",
        "/a#b",
        "/a\r\nHost:evil",
    ] {
        let mut metadata = request();
        metadata.path = path.into();
        assert!(metadata.encode().is_err(), "{path}");
    }
    let mut metadata = request();
    metadata.headers.insert("Host\r\nEvil".into(), "x".into());
    assert!(metadata.encode().is_err());
    let mut metadata = request();
    metadata
        .headers
        .insert("Origin".into(), "x\r\nHost: evil".into());
    assert!(metadata.encode().is_err());
    let mut metadata = request();
    metadata
        .headers
        .insert("upgrade".into(), "websocket".into());
    assert!(metadata.encode().is_err());
}

#[test]
fn upgrade_handshake_requires_valid_websocket_fields() {
    let mut metadata = request();
    metadata.headers.remove("Sec-WebSocket-Key");
    assert!(metadata.encode().is_err());
    let mut metadata = request();
    metadata.method = "POST".into();
    assert!(metadata.encode().is_err());
    let mut metadata = response();
    metadata.status = 200;
    assert!(metadata.encode().is_err());
    let mut metadata = response();
    metadata.headers.remove("Sec-WebSocket-Accept");
    assert!(metadata.encode().is_err());
}
