//! Read-only Git inventory. Paths come from Git, never reconstructed from titles.
use super::git_changes::git;
use crate::{CoreError, CoreResult};
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Worktree {
    pub root: String,
    pub directory: String,
    pub branch: String,
    pub available: bool,
    pub is_main: bool,
    pub upstream: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Inventory {
    pub repository: Option<String>,
    pub worktrees: Vec<Worktree>,
}

/// Return only a clean github.com repository identity, never embedded credentials.
fn github_repository(remote: &str) -> Option<String> {
    let path = remote
        .trim()
        .strip_prefix("git@github.com:")
        .or_else(|| remote.trim().strip_prefix("ssh://git@github.com/"))
        .or_else(|| remote.trim().strip_prefix("https://github.com/"))?;
    let path = path
        .trim_end_matches('/')
        .strip_suffix(".git")
        .unwrap_or(path.trim_end_matches('/'));
    let parts: Vec<_> = path.split('/').collect();
    if parts.len() != 2
        || parts.iter().any(|p| {
            p.is_empty()
                || *p == "."
                || *p == ".."
                || !p
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b"-_.".contains(&b))
        })
    {
        return None;
    }
    Some(path.into())
}

fn parse(raw: &str, relative: &Path) -> Vec<Worktree> {
    raw.split("\0\0")
        .filter_map(|record| {
            let fields: Vec<_> = record.split('\0').collect();
            let root = fields.iter().find_map(|s| s.strip_prefix("worktree "))?;
            if fields.contains(&"bare") {
                return None;
            }
            let branch = fields
                .iter()
                .find_map(|s| s.strip_prefix("branch refs/heads/"))
                .unwrap_or("Detached HEAD");
            let directory = Path::new(root).join(relative);
            Some(Worktree {
                root: root.into(),
                directory: directory.to_string_lossy().into_owned(),
                branch: branch.into(),
                available: directory.is_dir(),
                is_main: false,
                upstream: None,
            })
        })
        .collect()
}

pub fn inventory(root: &str) -> CoreResult<Inventory> {
    let project = Path::new(root).canonicalize()?;
    let repo = git(&project, &["rev-parse", "--show-toplevel"], 32_768)?;
    let repo = Path::new(repo.trim_end()).canonicalize()?;
    let relative = project
        .strip_prefix(&repo)
        .map_err(|_| CoreError::InvalidPath("Project is outside its repository".into()))?;
    let raw = git(&repo, &["worktree", "list", "--porcelain", "-z"], 1_048_576)?;
    let mut worktrees = parse(&raw, relative);
    if worktrees.len() > 128 {
        return Err(CoreError::Task(
            "This repository has more than 128 worktrees. Open it in your Git client.".into(),
        ));
    }
    if let Some(first) = worktrees.first_mut() {
        first.is_main = true;
    }
    let branches = git(
        &repo,
        &[
            "for-each-ref",
            "--format=%(refname:short)%00%(upstream:short)",
            "refs/heads",
        ],
        1_048_576,
    )?;
    for tree in &mut worktrees {
        tree.upstream = branches.lines().find_map(|line| {
            let (branch, upstream) = line.split_once('\0')?;
            (branch == tree.branch && !upstream.is_empty()).then(|| upstream.into())
        });
    }
    let remote = git(&repo, &["config", "--get", "remote.origin.url"], 32_768).unwrap_or_default();
    Ok(Inventory {
        repository: github_repository(&remote),
        worktrees,
    })
}

#[cfg(test)]
#[path = "worktrees_tests.rs"]
mod tests;
