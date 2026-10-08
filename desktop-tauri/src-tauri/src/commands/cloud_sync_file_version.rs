use super::cloud_files::CloudFile;
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
pub(super) fn version(file: Option<&CloudFile>) -> Value {
    let Some(f) = file else {
        return json!({ "missing": true });
    };
    let bytes = STANDARD.decode(&f.content).unwrap_or_default();
    let text = std::str::from_utf8(&bytes)
        .ok()
        .filter(|s| !s.contains('\0'));
    json!({ "sha256": f.sha256, "executable": f.executable, "bytes": bytes.len(), "binary": text.is_none(),
        "text": text.map(|s| s.chars().take(8192).collect::<String>()), "truncated": text.is_some_and(|s| s.chars().count() > 8192) })
}
