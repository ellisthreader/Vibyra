//! Apply the exact reviewed Agent worktree snapshot to the granted source folder
//! as ordinary uncommitted changes. A path is written only while the source
//! still holds the base bytes (or already holds the reviewed bytes); any other
//! source edit is a conflict and nothing is written.
use super::{git, publish_snapshot, Grant};
use crate::agent_computer_apply::git_cmd;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;

const MAX_BYTES: u64 = 2 * 1024 * 1024;
const STALE: &str = "The Agent worktree changed after your review. Refresh the review first.";

struct Step {
    path: String,
    base: Option<Vec<u8>>,
    next: Option<(Vec<u8>, bool)>,
}

pub(super) fn apply(grant: &Grant, reviewed: &str) -> Result<Value, String> {
    let snapshot = publish_snapshot::read(grant)?;
    if snapshot["snapshotSha256"].as_str() != Some(reviewed) {
        return Err(STALE.into());
    }
    let source = grant
        .source_path
        .as_deref()
        .filter(|source| *source != grant.path)
        .ok_or("Applying needs a separate Agent worktree.")?;
    let base = snapshot["baseSha"].as_str().ok_or(STALE)?;
    let mut steps = Vec::new();
    for file in snapshot["files"].as_array().ok_or(STALE)? {
        let path = file["path"].as_str().ok_or(STALE)?;
        let status = file["status"].as_str().unwrap_or("");
        if let Some(old) = file["previousPath"]
            .as_str()
            .filter(|_| !status.contains('C'))
        {
            let base = blob(&grant.path, base, old)?;
            steps.push(Step {
                path: old.into(),
                base,
                next: None,
            });
        }
        let next = match file["sha256"].as_str() {
            None => None,
            Some(expected) => {
                let (bytes, mode) = publish_snapshot::read_file(grant, Path::new(path))
                    .map_err(|_| "A reviewed file could not be read safely.")?;
                if format!("{:x}", Sha256::digest(&bytes)) != expected
                    || file["mode"].as_str() != Some(mode)
                {
                    return Err(STALE.into());
                }
                Some((bytes, mode == "100755"))
            }
        };
        let base = blob(&grant.path, base, path)?;
        steps.push(Step {
            path: path.into(),
            base,
            next,
        });
    }
    grant.validate_path()?;
    let (mut pending, mut unchanged, mut conflicts) = (Vec::new(), Vec::new(), Vec::new());
    for step in steps {
        let wanted = step.next.as_ref().map(|(bytes, _)| bytes.as_slice());
        match current(source, &step.path) {
            Err(reason) => conflicts.push(json!({"path":step.path,"reason":reason})),
            Ok(now) if now.as_deref() == wanted => unchanged.push(step.path),
            Ok(now) if now == step.base => pending.push(step),
            Ok(_) => conflicts.push(json!({"path":step.path,
                "reason":"Changed in your project since the teammate started"})),
        }
    }
    if !conflicts.is_empty() {
        return Ok(json!({"applied":false,"files":[],"unchanged":unchanged,"conflicts":conflicts}));
    }
    let mut applied = Vec::new();
    for step in pending {
        write(source, &step).map_err(|error| {
            format!(
                "Stopped at {} after applying {} file(s): {error}",
                step.path,
                applied.len()
            )
        })?;
        applied.push(step.path);
    }
    Ok(json!({"applied":true,"files":applied,"unchanged":unchanged,"conflicts":[]}))
}

/// The committed base bytes, straight from the object store (no filters).
fn blob(root: &Path, base: &str, path: &str) -> Result<Option<Vec<u8>>, String> {
    if path.contains(['\n', '\0']) || base.len() != 40 {
        return Err("A reviewed path cannot be applied safely.".into());
    }
    let spec = format!("{base}:{path}");
    let check = git_cmd::run(
        root,
        &["cat-file", "--batch-check=%(objecttype) %(objectsize)"],
        Some(&format!("{spec}\n")),
    )?;
    let check = String::from_utf8_lossy(&check);
    let Some(size) = check.trim().strip_prefix("blob ") else {
        return Ok(None);
    };
    if size.parse::<u64>().map_err(|_| STALE)? > MAX_BYTES {
        return Err("A changed file is too large to apply here.".into());
    }
    git_cmd::run(root, &["cat-file", "blob", &spec], None).map(Some)
}

fn current(source: &Path, path: &str) -> Result<Option<Vec<u8>>, String> {
    if !git::permitted(source, path) {
        return Err("A linked or private path in your project".into());
    }
    let target = source.join(path);
    let metadata = match std::fs::symlink_metadata(&target) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err("Unreadable in your project".into()),
    };
    if !metadata.is_file() || metadata.len() > MAX_BYTES {
        return Err("Not a regular file in your project".into());
    }
    std::fs::read(&target)
        .map(Some)
        .map_err(|_| "Unreadable in your project".into())
}

fn write(source: &Path, step: &Step) -> Result<(), String> {
    if !git::permitted(source, &step.path) {
        return Err("the path became linked".into());
    }
    let target = source.join(&step.path);
    let Some((bytes, executable)) = &step.next else {
        return match std::fs::remove_file(&target) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
            _ => Ok(()),
        };
    };
    let parent = target.parent().ok_or("invalid path")?;
    std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    if !git::permitted(source, &step.path) {
        return Err("the path became linked".into());
    }
    let temp = parent.join(format!(".vibyra-apply-{}", uuid::Uuid::new_v4()));
    let result = (|| {
        std::fs::write(&temp, bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let old = std::fs::metadata(&target).map(|m| m.permissions().mode() & 0o666);
            let mode = old.unwrap_or(0o644) | if *executable { 0o111 } else { 0 };
            std::fs::set_permissions(&temp, std::fs::Permissions::from_mode(mode))?;
        }
        #[cfg(not(unix))]
        let _ = executable;
        std::fs::rename(&temp, &target)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result.map_err(|error| error.to_string())
}
