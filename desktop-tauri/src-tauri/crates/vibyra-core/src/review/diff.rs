use std::path::Path;
use std::process::Command;

use crate::{CoreError, CoreResult};

use super::git_bytes;

/// The renderer must never receive an unbounded string; a diff past this is
/// cut on a character boundary with an explicit marker.
const MAX_DIFF_BYTES: usize = 512 * 1024;

/// One file's unified diff against the safe-mode base. Tracked files diff
/// through git; a file the agent created and never added has no history to
/// diff against, so it is compared to nothing via `--no-index`.
pub fn file_diff(worktree: &Path, base: &str, path: &str) -> CoreResult<String> {
    validate(path)?;
    let tracked = git_bytes(worktree, &["diff", base, "--", path])?;
    if !tracked.is_empty() {
        return Ok(bounded(tracked));
    }
    Ok(bounded(untracked_diff(worktree, path)?))
}

/// The path comes from a status listing the renderer echoed back; it must
/// still name something inside the worktree, not wherever `..` points.
fn validate(path: &str) -> CoreResult<()> {
    let escapes =
        Path::new(path).is_absolute() || path.split(['/', '\\']).any(|segment| segment == "..");
    if path.is_empty() || escapes {
        return Err(CoreError::InvalidPath(format!(
            "not a worktree-relative path: {path}"
        )));
    }
    Ok(())
}

/// `git diff --no-index` exits 1 when the files differ — that is the answer,
/// not a failure, so this cannot go through `git_bytes`.
fn untracked_diff(worktree: &Path, path: &str) -> CoreResult<Vec<u8>> {
    let output = Command::new("git")
        .arg("-C")
        .arg(worktree)
        .args(["diff", "--no-index", "--", "/dev/null", path])
        .output()?;
    if output.status.code() == Some(0) || output.status.code() == Some(1) {
        return Ok(output.stdout);
    }
    let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
    Err(CoreError::Settings(format!(
        "Review could not diff {path}: {detail}"
    )))
}

fn bounded(raw: Vec<u8>) -> String {
    let text = String::from_utf8_lossy(&raw);
    if text.len() <= MAX_DIFF_BYTES {
        return text.to_string();
    }
    let mut cut = MAX_DIFF_BYTES;
    while cut > 0 && !text.is_char_boundary(cut) {
        cut -= 1;
    }
    format!("{}\n… diff truncated at 512 KiB", &text[..cut])
}
