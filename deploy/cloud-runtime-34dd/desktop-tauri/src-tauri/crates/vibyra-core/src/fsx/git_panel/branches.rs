//! Local branches, switching and creating. A switch over uncommitted changes
//! is refused unless the person chose to stash them first.
use super::refs::{branch_exists, check_with_git, validate_branch};
use super::{changed_files, unmerged, GitResult, DIRTY_PREFIX};
use crate::fsx::ship::git::text;
use crate::fsx::ship::ShipError;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branch {
    pub name: String,
    pub current: bool,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub hash: String,
    pub subject: String,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Branches {
    /// `None` on a detached HEAD or a repository without commits.
    pub current: Option<String>,
    pub detached: bool,
    pub branches: Vec<Branch>,
    /// Tracked files with changes: what a switch would carry or refuse over.
    pub dirty: u32,
    pub conflicts: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SwitchMode {
    Refuse,
    Stash,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SwitchOutcome {
    pub branch: String,
    pub stashed: bool,
}

fn track(text: &str) -> (u32, u32) {
    let number = |word: &str| {
        text.split(|c: char| !c.is_ascii_alphanumeric())
            .skip_while(|part| *part != word)
            .nth(1)
            .and_then(|n| n.parse().ok())
            .unwrap_or(0)
    };
    (number("ahead"), number("behind"))
}

pub fn branches(root: &Path) -> GitResult<Branches> {
    let current = text(root, &["symbolic-ref", "--short", "-q", "HEAD"]).ok();
    let detached =
        current.is_none() && text(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_ok();
    let listing = text(
        root,
        &[
            "for-each-ref", "--count=200", "--sort=-committerdate",
            "--format=%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f%(objectname:short)%1f%(contents:subject)",
            "refs/heads",
        ],
    )?;
    let branches = listing
        .lines()
        .filter_map(|line| {
            let mut f = line.split('\u{1f}');
            let name = f.next()?.to_string();
            let upstream = f.next().filter(|u| !u.is_empty()).map(str::to_string);
            let (ahead, behind) = track(f.next()?);
            let hash = f.next()?.to_string();
            let subject = f
                .next()?
                .chars()
                .filter(|c| !c.is_control())
                .take(120)
                .collect();
            Some(Branch {
                current: current.as_deref() == Some(&name),
                name,
                upstream,
                ahead,
                behind,
                hash,
                subject,
            })
        })
        .collect();
    Ok(Branches {
        current,
        detached,
        branches,
        dirty: changed_files(root)?.len() as u32,
        conflicts: unmerged(root)?.len() as u32,
    })
}

pub fn switch_branch(root: &Path, name: &str, mode: SwitchMode) -> GitResult<SwitchOutcome> {
    validate_branch(name)?;
    if !branch_exists(root, name) {
        return Err(ShipError::new("That branch does not exist here."));
    }
    let done = |stashed| SwitchOutcome {
        branch: name.to_string(),
        stashed,
    };
    if text(root, &["symbolic-ref", "--short", "-q", "HEAD"])
        .ok()
        .as_deref()
        == Some(name)
    {
        return Ok(done(false));
    }
    if !unmerged(root)?.is_empty() {
        return Err(ShipError::new(
            "Finish resolving the merge conflicts before switching branches.",
        ));
    }
    let changed = changed_files(root)?;
    if changed.is_empty() {
        text(root, &["switch", name])?;
        return Ok(done(false));
    }
    if mode == SwitchMode::Refuse {
        return Err(ShipError::new(format!(
            "{DIRTY_PREFIX} {} file{} with changes. Commit them, or stash them and switch.",
            changed.len(),
            if changed.len() == 1 { " has" } else { "s have" }
        )));
    }
    text(
        root,
        &[
            "stash",
            "push",
            "-m",
            &format!("Vibyra: before switching to {name}"),
        ],
    )?;
    if let Err(error) = text(root, &["switch", name]) {
        // Put the changes back so a failed switch leaves the tree as it was.
        let _ = text(root, &["stash", "pop"]);
        return Err(error);
    }
    Ok(done(true))
}

/// A new branch at HEAD. Changes in the tree come along untouched, so a dirty
/// tree is fine; `switch` false only creates the name.
pub fn create_branch(root: &Path, name: &str, switch: bool) -> GitResult<SwitchOutcome> {
    validate_branch(name)?;
    check_with_git(root, name)?;
    if branch_exists(root, name) {
        return Err(ShipError::new("A branch with that name already exists."));
    }
    if text(root, &["rev-parse", "--verify", "--quiet", "HEAD"]).is_err() {
        return Err(ShipError::new(
            "Make a first commit before creating branches.",
        ));
    }
    if switch {
        text(root, &["switch", "-c", name])?;
    } else {
        text(root, &["branch", name])?;
    }
    Ok(SwitchOutcome {
        branch: name.to_string(),
        stashed: false,
    })
}
