//! Carrying a Safe Mode worktree's branch from "the agent finished" onward:
//! commit, push, private checkpoints, and clearing the folder after a merge.
//!
//! Every entry point takes the project root and a worktree root exactly as
//! `fsx::worktrees::inventory` reported them and re-reads that inventory
//! before touching anything (`guard`): never a caller's directory, never the
//! main worktree, never a detached HEAD, never the default branch. No force
//! push exists here, and the only credentials used are the computer's own.
mod checkpoint;
mod checkpoint_list;
mod commit;
mod discard;
pub(crate) mod git;
pub(crate) mod guard;
mod push;
mod restore;
mod snapshot;
mod step;
#[cfg(test)]
mod tests_checkpoint;
#[cfg(test)]
mod tests_guard;
#[cfg(test)]
mod tests_ship;
#[cfg(test)]
mod tests_support;

pub use checkpoint::{create_checkpoint, Checkpoint, MAX_CHECKPOINTS};
pub use checkpoint_list::list_checkpoints;
pub use commit::{commit, CommitOutcome};
pub use discard::{remove_worktree, RemoveOutcome};
pub use push::{push, PushOutcome};
pub use restore::{restore_checkpoint, RestoreOutcome};

use serde::Serialize;

/// A failure already worded for the person reading it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(transparent)]
pub struct ShipError(String);

impl ShipError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }

    pub fn message(&self) -> &str {
        &self.0
    }

    /// Git's own words, turned into the sentence a person can act on.
    pub(crate) fn from_git(output: &str) -> Self {
        let has = |needle: &str| output.contains(needle);
        let message = if has("Please tell me who you are")
            || has("Author identity unknown")
            || has("unable to auto-detect email")
        {
            "Git needs your name and email first. Set user.name and user.email with git config in a terminal."
        } else if has("non-fast-forward") || has("fetch first") || has("[rejected]") {
            "GitHub has commits this branch does not have. Vibyra never force-pushes: update the branch in a terminal, then push again."
        } else if has("could not read Username")
            || has("Authentication failed")
            || has("Permission denied (publickey")
            || has("terminal prompts disabled")
        {
            "Git could not sign in to GitHub on this computer. Push once from a terminal to set up credentials, then try again."
        } else if has("nothing to commit") {
            "There is nothing to commit."
        } else if has("GH006") || has("protected branch") {
            "GitHub protects that branch and refused the push."
        } else {
            let line = output
                .lines()
                .map(str::trim)
                .rfind(|l| !l.is_empty())
                .unwrap_or("Git did not finish.");
            let line = line
                .trim_start_matches("fatal: ")
                .trim_start_matches("error: ");
            return Self(line.chars().take(240).collect());
        };
        Self(message.into())
    }
}

impl std::fmt::Display for ShipError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ShipError {}
