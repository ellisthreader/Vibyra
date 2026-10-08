//! Push a worktree's branch to the remote with the computer's own credentials.
//!
//! The refspec is the branch against itself with no `+`, so it can neither
//! force nor name another ref, and a configured `remote.origin.push` never
//! applies. A remote that moved on is refused by Git itself ("rejected"), and
//! behind-ness is checked first so the answer needs no network.
use super::git::text;
use super::guard::resolve;
use super::step::run;
use super::ShipError;
use crate::fsx::worktree_status::facts;
use serde::Serialize;
use std::sync::atomic::AtomicBool;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PushOutcome {
    pub branch: String,
    pub sha: String,
    pub upstream: String,
}

fn valid_branch(branch: &str) -> bool {
    !branch.is_empty()
        && branch.len() <= 200
        && !branch.starts_with(['-', '/'])
        && !branch.contains("..")
        && branch
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"-_./".contains(&b))
}

/// `remote_ok` decides which `origin` URLs may receive a push: the app passes
/// "a github.com repository"; tests pass a local bare remote.
pub fn push(
    project_root: &str,
    worktree_root: &str,
    remote_ok: &dyn Fn(&str) -> bool,
    cancel: &AtomicBool,
) -> Result<PushOutcome, ShipError> {
    let target = resolve(project_root, worktree_root)?;
    if !valid_branch(&target.branch) {
        return Err(ShipError::new(
            "That branch name cannot be pushed from here.",
        ));
    }
    let url = text(&target.root, &["config", "--get", "remote.origin.url"])
        .map_err(|_| ShipError::new("This repository has no origin remote to push to."))?;
    if !remote_ok(&url) {
        return Err(ShipError::new("Vibyra only pushes to a GitHub repository."));
    }
    let facts = facts(&target.root)?;
    if facts.behind.unwrap_or(0) > 0 {
        return Err(ShipError::new(
            "GitHub has commits this branch does not have. Vibyra never force-pushes: update the branch in a terminal, then push again.",
        ));
    }
    if facts.ahead_of_base == 0 && facts.upstream.is_none() {
        return Err(ShipError::new(
            "There is nothing to push yet. Commit your changes first.",
        ));
    }
    let refspec = format!("refs/heads/{0}:refs/heads/{0}", target.branch);
    run(
        &target.root,
        "Pushing to GitHub",
        &["push", "--no-follow-tags", "-u", "origin", &refspec],
        cancel,
    )?;
    Ok(PushOutcome {
        sha: text(&target.root, &["rev-parse", "HEAD"])?,
        upstream: format!("origin/{}", target.branch),
        branch: target.branch,
    })
}
