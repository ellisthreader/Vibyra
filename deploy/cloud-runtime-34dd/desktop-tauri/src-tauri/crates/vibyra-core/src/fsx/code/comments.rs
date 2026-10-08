//! Review comments, one small private JSON file per project in the settings
//! folder. A missing or damaged file reads as no comments.

use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::{CoreError, CoreResult};

const MAX_COMMENTS: usize = 2000;
const MAX_BYTES: usize = 2 * 1024 * 1024;

fn file_for(dir: &Path, project_root: &str) -> PathBuf {
    let digest = super::sha256_hex(project_root.as_bytes());
    dir.join("code-comments")
        .join(format!("{}.json", &digest[..16]))
}

/// `{"comments": [...]}` for the project, empty when nothing is saved.
pub fn load_comments(dir: &Path, project_root: &str) -> Value {
    let path = file_for(dir, project_root);
    let stored = std::fs::metadata(&path)
        .ok()
        .filter(|meta| meta.len() <= 2 * MAX_BYTES as u64)
        .and_then(|_| std::fs::read(&path).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    let comments = stored
        .filter(|value| value["projectRoot"].as_str() == Some(project_root))
        .and_then(|mut value| match value["comments"].take() {
            list @ Value::Array(_) => Some(list),
            _ => None,
        })
        .unwrap_or_else(|| json!([]));
    json!({ "comments": comments })
}

fn invalid(message: &str) -> CoreError {
    CoreError::Settings(message.into())
}

/// Replaces the project's saved comments after checking their shape.
pub fn save_comments(dir: &Path, project_root: &str, comments: Value) -> CoreResult<()> {
    let Value::Array(items) = &comments else {
        return Err(invalid("Comments must be a list."));
    };
    if items.len() > MAX_COMMENTS {
        return Err(invalid("Too many comments. Resolve some first."));
    }
    if !items.iter().all(|item| item["id"].is_string()) {
        return Err(invalid("Every comment needs an id."));
    }
    let bytes = serde_json::to_vec(&json!({
        "projectRoot": project_root,
        "comments": comments,
    }))
    .map_err(|error| invalid(&error.to_string()))?;
    if bytes.len() > MAX_BYTES {
        return Err(invalid("These comments are too large to save."));
    }
    let path = file_for(dir, project_root);
    if let Some(folder) = path.parent() {
        std::fs::create_dir_all(folder)?;
    }
    crate::fsx::write_private_atomic(&path, &bytes)
}

#[cfg(test)]
#[path = "comments_tests.rs"]
mod tests;
