//! Re-read exact approved worktree bytes before the backend's one-time GitHub write.
use super::{publish_snapshot, Grant};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;

pub(super) fn build(grant: &Grant, approved: &Value) -> Result<Value, String> {
    let current = publish_snapshot::read(grant)?;
    let metadata = json!({"baseSha":current["baseSha"], "branch":current["branch"],
        "snapshotSha256":current["snapshotSha256"], "files":current["files"],
        "totalBytes":current["totalBytes"]});
    if &metadata != approved {
        return Err("The Mac worktree changed after approval. Review the current snapshot.".into());
    }
    let mut upload = json!({"baseSha":current["baseSha"], "branch":current["branch"],
        "snapshotSha256":current["snapshotSha256"], "files":current["files"]});
    let files = upload["files"]
        .as_array_mut()
        .ok_or("Invalid publish snapshot")?;
    for file in files {
        if file["sha256"].is_null() {
            file["contentBase64"] = Value::Null;
            continue;
        }
        let path = file["path"].as_str().ok_or("Invalid changed path")?;
        let (bytes, mode) = publish_snapshot::read_file(grant, Path::new(path))
            .map_err(|_| "A changed file could not be read safely")?;
        let sha = format!("{:x}", Sha256::digest(&bytes));
        if file["bytes"].as_u64() != Some(bytes.len() as u64)
            || file["mode"].as_str() != Some(mode)
            || file["sha256"].as_str() != Some(sha.as_str())
        {
            return Err("A changed file no longer matches the approved bytes.".into());
        }
        file["contentBase64"] = json!(base64::engine::general_purpose::STANDARD.encode(bytes));
    }
    if publish_snapshot::read(grant)? != current {
        return Err("The Mac worktree changed during upload preparation.".into());
    }
    Ok(upload)
}

#[cfg(test)]
#[path = "agent_computer_publish_upload_tests.rs"]
mod tests;
