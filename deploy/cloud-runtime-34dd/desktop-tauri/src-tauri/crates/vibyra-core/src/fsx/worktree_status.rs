//! What a worktree row needs to choose its one next action: the facts Git
//! knows locally. Never stored; the renderer derives the stage from these.
use super::ship::git::text;
use super::ship::guard::default_branch;
use super::ship::ShipError;
use super::worktrees::inventory;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LastCommit {
    pub sha: String,
    pub subject: String,
    pub time: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShipFacts {
    pub branch: String,
    pub detached: bool,
    pub head: String,
    pub upstream: Option<String>,
    /// Commits only here / only on the remote branch; `None` with no remote copy.
    pub ahead: Option<u32>,
    pub behind: Option<u32>,
    pub default_branch: Option<String>,
    /// Commits on this branch that the default branch does not have.
    pub ahead_of_base: u32,
    pub dirty: u32,
    pub staged: u32,
    pub untracked: u32,
    pub conflicted: u32,
    pub last_commit: Option<LastCommit>,
}

/// Counts from `status --porcelain=v2 -z`: (dirty, staged, untracked, conflicted).
fn count_entries(raw: &str) -> (u32, u32, u32, u32) {
    let mut fields = raw.split('\0').filter(|f| !f.is_empty());
    let (mut dirty, mut staged, mut untracked, mut conflicted) = (0, 0, 0, 0);
    while let Some(field) = fields.next() {
        let mut parts = field.split(' ');
        match parts.next() {
            Some(kind @ ("1" | "2" | "u")) => {
                dirty += 1;
                let xy = parts.next().unwrap_or("..").as_bytes();
                if kind == "u" {
                    conflicted += 1;
                } else if xy.first().is_some_and(|x| *x != b'.') {
                    staged += 1;
                }
                if kind == "2" {
                    fields.next(); // the rename's original path
                }
            }
            Some("?") => {
                dirty += 1;
                untracked += 1;
            }
            _ => {}
        }
    }
    (dirty, staged, untracked, conflicted)
}

fn header<'a>(raw: &'a str, name: &str) -> Option<&'a str> {
    let prefix = format!("# {name} ");
    raw.split('\0')
        .find_map(|f| f.strip_prefix(prefix.as_str()))
}

fn pair(root: &Path, spec: &str) -> Option<(u32, u32)> {
    let out = text(root, &["rev-list", "--left-right", "--count", spec]).ok()?;
    let (a, b) = out.split_once('\t')?;
    Some((a.trim().parse().ok()?, b.trim().parse().ok()?))
}

fn exists(root: &Path, reference: &str) -> bool {
    text(root, &["rev-parse", "--verify", "--quiet", reference]).is_ok()
}

pub fn facts(root: &Path) -> Result<ShipFacts, ShipError> {
    let raw = text(
        root,
        &[
            "status",
            "--porcelain=v2",
            "--branch",
            "-z",
            "--untracked-files=all",
        ],
    )?;
    let branch = header(&raw, "branch.head").unwrap_or("").to_string();
    let detached = branch == "(detached)" || branch.is_empty();
    let head = header(&raw, "branch.oid")
        .filter(|h| *h != "(initial)")
        .unwrap_or("")
        .to_string();
    let mut upstream = header(&raw, "branch.upstream").map(str::to_owned);
    let mut counts = header(&raw, "branch.ab").and_then(|ab| {
        let (a, b) = ab.split_once(' ')?;
        Some((
            a.trim_start_matches('+').parse().ok()?,
            b.trim_start_matches('-').parse().ok()?,
        ))
    });
    if counts.is_none() && !detached {
        // Pushed without `-u`: the remote copy still counts as pushed.
        let remote = format!("origin/{branch}");
        if exists(root, &format!("refs/remotes/{remote}")) {
            counts = pair(root, &format!("HEAD...{remote}"));
            upstream.get_or_insert(remote);
        }
    }
    let default = default_branch(root);
    let ahead_of_base = default
        .as_ref()
        .and_then(|d| {
            let remote = format!("refs/remotes/origin/{d}");
            let base = if exists(root, &remote) {
                remote
            } else {
                d.clone()
            };
            text(root, &["rev-list", "--count", &format!("{base}..HEAD")])
                .ok()?
                .parse()
                .ok()
        })
        .unwrap_or(0);
    let (dirty, staged, untracked, conflicted) = count_entries(&raw);
    let last_commit = text(root, &["log", "-1", "--format=%H%x1f%s%x1f%ct"])
        .ok()
        .and_then(|line| {
            let mut p = line.split('\u{1f}');
            Some(LastCommit {
                sha: p.next()?.into(),
                subject: p.next()?.into(),
                time: p.next()?.parse().ok()?,
            })
        });
    Ok(ShipFacts {
        branch,
        detached,
        head,
        upstream,
        ahead: counts.map(|c| c.0),
        behind: counts.map(|c| c.1),
        default_branch: default,
        ahead_of_base,
        dirty,
        staged,
        untracked,
        conflicted,
        last_commit,
    })
}

/// Facts for one of the project's linked worktrees (the inventory is the authority).
pub fn worktree_status(project_root: &str, worktree_root: &str) -> Result<ShipFacts, ShipError> {
    let listed = inventory(project_root)
        .map_err(|_| ShipError::new("This project is not a Git repository."))?;
    let tree = listed
        .worktrees
        .iter()
        .find(|t| t.root == worktree_root && !t.is_main)
        .ok_or_else(|| ShipError::new("That is not one of this project's worktrees."))?;
    if !tree.available {
        return Err(ShipError::new("This working folder is unavailable."));
    }
    facts(Path::new(&tree.root))
}

#[cfg(test)]
#[path = "worktree_status_tests.rs"]
mod tests;
