//! The committed version of a file, and one file across several worktrees
//! with their common ancestor.

use std::path::Path;

use super::file::{decode, looks_binary, read_capped};
use super::scope::{slash_path, split};
use super::{sha256_hex, CodeBase, CodeVersion, CodeVersions, MAX_FILE_BYTES};
use crate::fsx::git_changes::git;
use crate::{CoreError, CoreResult};

const MAX_ROOTS: usize = 6;

/// The commit `HEAD` names, `None` in an unborn repository or outside Git.
fn head(dir: &Path) -> Option<String> {
    let out = git(dir, &["rev-parse", "--verify", "-q", "HEAD"], 4096).ok()?;
    Some(out.trim().to_string()).filter(|sha| !sha.is_empty())
}

/// `rel` (relative to the canonical `root`) relative to the repository top.
fn repo_relative(canon_root: &Path, rel: &Path) -> CoreResult<String> {
    let top = crate::fsx::git_memo::toplevel(canon_root)?;
    let top = Path::new(&top).canonicalize()?;
    let prefix = canon_root
        .strip_prefix(&top)
        .map_err(|_| CoreError::InvalidPath("This folder is outside its repository.".into()))?;
    Ok(slash_path(&prefix.join(rel)))
}

/// A blob's text at `commit`; `None` when it is missing, binary or too big.
fn blob_text(dir: &Path, commit: &str, repo_rel: &str) -> Option<String> {
    let spec = format!("{commit}:{repo_rel}");
    let text = git(
        dir,
        &["show", "--no-textconv", &spec],
        MAX_FILE_BYTES as usize,
    )
    .ok()?;
    (!looks_binary(text.as_bytes())).then_some(text)
}

/// The file as of `HEAD` (or `previous_path` there, for a rename). The file
/// may be deleted in the working tree, so the path is only checked lexically.
pub fn base(root: &Path, path: &str, previous_path: Option<&str>) -> CoreResult<CodeBase> {
    let target = previous_path.filter(|p| !p.is_empty()).unwrap_or(path);
    let (canon_root, rel) = split(root, target)?;
    let repo_rel = repo_relative(&canon_root, &rel)?;
    let commit = head(&canon_root);
    let text = commit
        .as_deref()
        .and_then(|sha| blob_text(&canon_root, sha, &repo_rel));
    Ok(CodeBase { text, commit })
}

/// The working copy of `rel` under one root: missing, binary or oversized
/// files have no text; a symlink leaving the root is refused.
fn current(canon_root: &Path, rel: &Path) -> CoreResult<(Option<String>, Option<String>)> {
    if std::fs::symlink_metadata(canon_root.join(rel)).is_err() {
        return Ok((None, None));
    }
    let (_, file) = super::scope::resolve(canon_root, &slash_path(rel), false)?;
    let Ok(bytes) = read_capped(&file) else {
        return Ok((None, None));
    };
    let hash = sha256_hex(&bytes);
    Ok((decode(bytes).0, Some(hash)))
}

/// The newest commit every HEAD descends from; the first HEAD if Git
/// cannot say. Worktrees share one object store, so any of them can answer.
fn common_base(dir: &Path, commits: &[String]) -> Option<String> {
    let mut unique: Vec<&str> = Vec::new();
    for sha in commits {
        if !unique.contains(&sha.as_str()) {
            unique.push(sha);
        }
    }
    match unique.as_slice() {
        [] => None,
        [only] => Some(only.to_string()),
        many => {
            let mut args = vec!["merge-base", "--octopus"];
            args.extend(many.iter().copied());
            git(dir, &args, 4096)
                .ok()
                .and_then(|out| out.lines().next().map(|l| l.trim().to_string()))
                .filter(|sha| !sha.is_empty())
                .or_else(|| Some(many[0].to_string()))
        }
    }
}

/// One file, `path` relative to each root, from one to six worktrees of the
/// same repository plus the version at their common ancestor.
pub fn versions(roots: &[String], path: &str) -> CoreResult<CodeVersions> {
    if roots.is_empty() || roots.len() > MAX_ROOTS {
        return Err(CoreError::InvalidPath(
            "Compare needs one to six folders.".into(),
        ));
    }
    let mut versions = Vec::with_capacity(roots.len());
    let mut commits = Vec::new();
    let mut first = None;
    for root in roots {
        let (canon_root, rel) = split(Path::new(root), path)?;
        let (text, hash) = current(&canon_root, &rel)?;
        if let Some(sha) = head(&canon_root) {
            commits.push(sha);
        }
        versions.push(CodeVersion {
            root: root.clone(),
            text,
            hash,
        });
        first.get_or_insert((canon_root, rel));
    }
    let (first_root, rel) = first.expect("at least one root");
    let commit = common_base(&first_root, &commits);
    let text = commit.as_deref().and_then(|sha| {
        let repo_rel = repo_relative(&first_root, &rel).ok()?;
        blob_text(&first_root, sha, &repo_rel)
    });
    Ok(CodeVersions {
        base: CodeBase { text, commit },
        versions,
    })
}

#[cfg(test)]
#[path = "base_tests.rs"]
mod tests;
