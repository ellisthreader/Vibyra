//! The secret guard on local MCP calls (roadmap Part 16), used by the Mac runner
//! only when the claimed run says `guard.secrets` is on. A call whose path-like
//! arguments name a sensitive file (`.env`, `id_rsa`, `*.pem` ...) is refused
//! unless the person allowed the server's folder; the text a tool returns is
//! redacted. Bounds stay those of `CallResult`.

use super::limits::RESULT_TEXT_BYTES;
use super::{CallResult, ServerSpec};
use crate::secret_guard::{allow, redact, redact_value};
use serde_json::Value;
use std::path::Path;

const REASON: &str = "This file looks like it holds secrets, so Vibyra does not let the teammate open it. Allow the server's folder in Settings if it should.";

/// Argument names that carry a file or folder, compared case-insensitively without `_`.
const PATH_KEYS: [&str; 8] = [
    "path",
    "paths",
    "source",
    "destination",
    "file",
    "filepath",
    "directory",
    "files",
];

/// Every path-like string in the arguments: the listed keys, as a string or an array of strings.
pub fn path_arguments(arguments: &Value) -> Vec<&str> {
    let mut out = Vec::new();
    for (key, value) in arguments.as_object().into_iter().flatten() {
        if !PATH_KEYS.contains(&key.replace('_', "").to_ascii_lowercase().as_str()) {
            continue;
        }
        match value {
            Value::String(path) => out.push(path.as_str()),
            Value::Array(items) => out.extend(items.iter().filter_map(Value::as_str)),
            _ => {}
        }
    }
    out
}

/// The folder a server works in: its working folder, else its last absolute argument
/// (the filesystem preset takes the folder as an argument).
pub fn server_folder(spec: &ServerSpec) -> Option<&str> {
    spec.cwd.as_deref().or_else(|| {
        spec.args
            .iter()
            .rev()
            .map(String::as_str)
            .find(|a| Path::new(a).is_absolute())
    })
}

/// Why this call must not run, or `None`.
pub fn refusal(settings_dir: &Path, spec: &ServerSpec, arguments: &Value) -> Option<String> {
    let folder = server_folder(spec).unwrap_or_default();
    let hit = path_arguments(arguments)
        .into_iter()
        .any(|p| allow::refuses(settings_dir, folder, p));
    hit.then(|| REASON.to_owned())
}

/// The result as the model may see it: secrets masked in the text and the structured part.
pub fn redact_result(mut result: CallResult) -> CallResult {
    result.text = redact(&result.text);
    if result.text.len() > RESULT_TEXT_BYTES {
        let mut end = RESULT_TEXT_BYTES;
        while !result.text.is_char_boundary(end) {
            end -= 1;
        }
        result.text.truncate(end);
        result.truncated = true;
    }
    result.structured = result.structured.map(redact_value);
    result
}
