use std::path::Path;
use std::process::Command;

use crate::{CoreError, CoreResult};

use super::{git_bytes, git_root, repo_relative};

/// The renderer must never receive an unbounded string; a diff past this is
/// cut on a character boundary with an explicit marker.
const MAX_DIFF_BYTES: usize = 512 * 1024;

/// One file's unified diff against the safe-mode base. Tracked files diff
/// through git; a file the agent created and never added has no history to
/// diff against, so it is compared to nothing via `--no-index`.
///
/// Run from the checkout root, because that is the frame `worktree_status`
/// names its paths in — pointed at a subfolder instead, every path from a
/// monorepo status listing missed as a pathspec and fell through to the
/// untracked branch.
pub fn file_diff(worktree: &Path, base: &str, path: &str) -> CoreResult<String> {
    repo_relative(path)?;
    let root = git_root(worktree)?;
    let tracked = git_bytes(&root, &["diff", base, "--", path])?;
    if !tracked.is_empty() {
        return Ok(bounded(tracked));
    }
    Ok(bounded(untracked_diff(&root, path)?))
}

/// One file's unified diff against `HEAD`, addressed by absolute path.
///
/// Agent Mode has neither a worktree nor a base commit: an agent edits inside
/// a folder it was granted, which may or may not be a repository. What a
/// person wants after a turn is what is different now and not yet committed,
/// which is `git diff HEAD` scoped to the one file — with the same fall
/// through to `--no-index` for a file the agent created and never added.
///
/// A path outside any repository answers with an empty string rather than an
/// error. "There is no diff to show here" is a state the transcript renders,
/// not a failure worth a red line in a conversation.
pub fn uncommitted_file_diff(file: &Path) -> CoreResult<String> {
    let Some(parent) = file.parent() else {
        return Ok(String::new());
    };
    let Ok(root) = git_root(parent) else {
        return Ok(String::new());
    };
    let name = file.to_string_lossy().into_owned();
    // `--` keeps a path that happens to look like a revision a pathspec.
    let tracked = git_bytes(&root, &["diff", "HEAD", "--", &name])?;
    if !tracked.is_empty() {
        return Ok(bounded(tracked));
    }
    Ok(bounded(untracked_diff(&root, &name)?))
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
