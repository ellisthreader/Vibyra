use std::path::PathBuf;

use serde::{Deserialize, Serialize};

// The identity of one safe-mode launch, split from `workspace.rs` — which
// owns the git machinery that creates it and sits near the 200-line ceiling.

/// Where one safe-mode launch lives: the folder the terminal opens in, the
/// branch holding the agent's work, and the commit it grew from. The branch
/// and base are what the Review tool diffs against later, so they are
/// returned rather than discarded at creation.
#[derive(Debug, Clone)]
pub struct SafeWorkspace {
    pub cwd: PathBuf,
    pub branch: String,
    pub base_commit: String,
}

/// The wire form: carried on `SessionInfo`, kept on the pane, and written to
/// session.json — so a review can still happen after the pane, or the whole
/// app, has been restarted.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafeWorkspaceRef {
    pub path: String,
    pub branch: String,
    pub base_commit: String,
}

impl SafeWorkspace {
    pub fn to_ref(&self) -> SafeWorkspaceRef {
        SafeWorkspaceRef {
            path: self.cwd.to_string_lossy().to_string(),
            branch: self.branch.clone(),
            base_commit: self.base_commit.clone(),
        }
    }
}
