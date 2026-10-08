//! Read-only, complete worktree snapshot for a later exact-approved branch publish.
use super::{git, Grant};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;

#[path = "agent_computer_git_ref.rs"]
mod git_ref;

const MAX_FILES: usize = 50;
const MAX_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_TOTAL_BYTES: u64 = 16 * 1024 * 1024;

pub(super) fn read(grant: &Grant) -> Result<Value, String> {
    grant.validate_path()?;
    if !grant.can_write || !grant.source_path.as_ref().is_some_and(|p| p != &grant.path) {
        return Err("Publishing needs a separate granted edit worktree.".into());
    }
    let root = grant
        .path
        .to_str()
        .ok_or("The worktree path is unavailable")?;
    let changes = vibyra_core::fsx::git_changes::safe_changes(root)
        .map_err(|_| "Could not inspect every worktree change.")?;
    if Path::new(&changes.root)
        .canonicalize()
        .map_err(|_| "The worktree is unavailable")?
        != grant.path
    {
        return Err("The granted worktree is not the Git repository root.".into());
    }
    if changes.files.is_empty() {
        return Err("This worktree has no changes to publish.".into());
    }
    if changes.files.len() > MAX_FILES {
        return Err("Review the worktree in smaller changes before publishing.".into());
    }
    let base = git_ref::value(&grant.path, &["rev-parse", "HEAD"])?;
    if base.len() != 40 || !base.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err("The worktree base commit could not be pinned.".into());
    }
    let branch = git_ref::value(&grant.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?;
    if branch != format!("vibyra-agent/{}", grant.id) {
        return Err("This is not the branch created for this Agent Computer grant.".into());
    }
    let mut files = Vec::new();
    let mut total = 0u64;
    for change in &changes.files {
        if !git::permitted(&grant.path, &change.path)
            || !change
                .previous_path
                .as_deref()
                .is_none_or(|p| git::permitted(&grant.path, p))
            || change.status.contains('U')
        {
            return Err(
                "A private, linked or conflicted worktree change blocks publishing.".into(),
            );
        }
        let path = Path::new(&change.path);
        let (sha, mode, bytes) = match read_file(grant, path) {
            Ok((content, mode)) => {
                let bytes = content.len() as u64;
                (
                    Some(format!("{:x}", Sha256::digest(content))),
                    Some(mode),
                    bytes,
                )
            }
            Err(error)
                if error.kind() == std::io::ErrorKind::NotFound && change.status.contains('D') =>
            {
                (None, None, 0)
            }
            Err(_) => return Err("A changed file could not be read safely.".into()),
        };
        total += bytes;
        if total > MAX_TOTAL_BYTES {
            return Err("The worktree exceeds the publish snapshot size limit.".into());
        }
        files.push(json!({"path":change.path,"status":change.status,
            "previousPath":change.previous_path,"sha256":sha,"mode":mode,"bytes":bytes}));
    }
    files.sort_by(|a, b| a["path"].as_str().cmp(&b["path"].as_str()));
    let after = vibyra_core::fsx::git_changes::safe_changes(root)
        .map_err(|_| "The worktree changed while checking it.")?;
    let before_status = serde_json::to_value(&changes.files).map_err(|e| e.to_string())?;
    let after_status = serde_json::to_value(&after.files).map_err(|e| e.to_string())?;
    if before_status != after_status
        || base != git_ref::value(&grant.path, &["rev-parse", "HEAD"])?
        || branch != git_ref::value(&grant.path, &["symbolic-ref", "--quiet", "--short", "HEAD"])?
    {
        return Err("The worktree changed while checking it. Refresh the review.".into());
    }
    grant.validate_path()?;
    let snapshot = digest(&base, &branch, &files)?;
    Ok(
        json!({"ready":true,"snapshotSha256":snapshot,"baseSha":base,"branch":branch,
        "files":files,"totalBytes":total}),
    )
}

/// UTF-8 fields separated by NUL, with a version and file count. Git paths
/// cannot contain NUL; the backend uses the same order and bytes.
pub(super) fn digest(base: &str, branch: &str, files: &[Value]) -> Result<String, String> {
    let mut hash = Sha256::new();
    hash.update(b"vibyra-agent-publish-v1\0");
    let mut field = |value: &str| {
        hash.update(value.as_bytes());
        hash.update([0]);
    };
    field(base);
    field(branch);
    field(&files.len().to_string());
    for file in files {
        for key in ["path", "status", "previousPath", "sha256", "mode"] {
            let value = file[key].as_str().unwrap_or("");
            if value.contains('\0') {
                return Err("The snapshot has an invalid path.".into());
            }
            field(value);
        }
        field(
            &file["bytes"]
                .as_u64()
                .ok_or("The snapshot has an invalid file size")?
                .to_string(),
        );
    }
    Ok(format!("{:x}", hash.finalize()))
}

#[cfg(unix)]
#[path = "agent_computer_publish_read_unix.rs"]
mod read_unix;
#[cfg(unix)]
pub(super) use read_unix::read_file;

#[cfg(windows)]
#[path = "agent_computer_publish_read_windows.rs"]
mod read_windows;
#[cfg(windows)]
pub(super) use read_windows::read_file;

#[cfg(not(any(unix, windows)))]
pub(super) fn read_file(
    _grant: &Grant,
    _path: &Path,
) -> Result<(Vec<u8>, &'static str), std::io::Error> {
    Err(std::io::ErrorKind::Unsupported.into())
}

#[cfg(test)]
#[path = "agent_computer_publish_snapshot_tests.rs"]
mod tests;
