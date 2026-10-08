//! Fixtures shared by the attachment tests: real (tiny) files, the backend's
//! reply shapes, and a claim that names them.

use super::mock_http::{MockServer, Reply};
use crate::agent_v2::api::RunnerApi;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const RUN: &str = "11111111-1111-4111-8111-111111111111";
pub const RT: &str = "22222222-2222-4222-8222-222222222222";
pub const IDS: [&str; 3] = [
    "aaaaaaaa-0000-4000-8000-000000000001",
    "aaaaaaaa-0000-4000-8000-000000000002",
    "aaaaaaaa-0000-4000-8000-000000000003",
];

/// A real solid-red JPEG (the backend re-encodes every photo to JPEG).
pub fn jpeg() -> Vec<u8> {
    let image = image::RgbImage::from_pixel(64, 64, image::Rgb([220, 30, 30]));
    let mut out = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 90)
        .encode_image(&image)
        .unwrap();
    out
}

/// A valid one-page PDF showing `line`.
pub fn pdf(line: &str) -> Vec<u8> {
    let stream = format!("BT /F1 18 Tf 20 50 Td ({line}) Tj ET");
    let objects = [
        "<</Type/Catalog/Pages 2 0 R>>".to_owned(),
        "<</Type/Pages/Kids[3 0 R]/Count 1>>".to_owned(),
        "<</Type/Page/Parent 2 0 R/MediaBox[0 0 400 100]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>"
            .to_owned(),
        format!("<</Length {}>>\nstream\n{stream}\nendstream", stream.len()),
        "<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>".to_owned(),
    ];
    let (mut out, mut offsets) = (String::from("%PDF-1.4\n"), Vec::new());
    for (index, body) in objects.iter().enumerate() {
        offsets.push(out.len());
        out.push_str(&format!("{} 0 obj\n{body}\nendobj\n", index + 1));
    }
    let xref = out.len();
    out.push_str(&format!(
        "xref\n0 {}\n0000000000 65535 f \n",
        objects.len() + 1
    ));
    for offset in offsets {
        out.push_str(&format!("{offset:010} 00000 n \n"));
    }
    out.push_str(&format!(
        "trailer\n<</Size {}/Root 1 0 R>>\nstartxref\n{xref}\n%%EOF\n",
        objects.len() + 1
    ));
    out.into_bytes()
}

pub fn sha(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

pub fn api(server: &MockServer) -> RunnerApi {
    RunnerApi {
        base: server.base.clone(),
        runtime_id: RT.into(),
        key: "k".repeat(64),
    }
}

/// The claim payload's attachment entry: the metadata admission stored.
pub fn item(id: &str, name: &str, mime: &str, bytes: &[u8]) -> Value {
    json!({"id": id, "name": name, "mimeType": mime, "size": bytes.len(), "sha256": sha(bytes)})
}

pub fn claim(generation: u64, items: Vec<Value>) -> Value {
    json!({"id": RUN, "generation": generation, "attachments": items})
}

/// The runner endpoint's success reply.
pub fn file_reply(content_type: &str, bytes: &[u8]) -> Reply {
    Reply {
        status: 200,
        headers: vec![
            ("Content-Type".into(), content_type.into()),
            ("X-Attachment-Sha256".into(), sha(bytes)),
            ("X-Content-Type-Options".into(), "nosniff".into()),
        ],
        body: bytes.to_vec(),
        length: true,
    }
}

/// A `{ok:false, code, error}` refusal.
pub fn refusal_reply(status: u16, code: &str) -> Reply {
    Reply {
        status,
        headers: vec![("Content-Type".into(), "application/json".into())],
        body: json!({"ok": false, "code": code, "error": "no"})
            .to_string()
            .into_bytes(),
        length: true,
    }
}
