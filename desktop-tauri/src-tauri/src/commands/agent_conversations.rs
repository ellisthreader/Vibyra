//! Whether the conversation a pane wants to resume still exists.
//!
//! Vibyra pins a conversation id when a Claude pane launches (`--session-id`)
//! and names that same id when the pane is resumed (`--resume`). The gap
//! between the two is a pane that was opened and closed without a word being
//! typed: Claude writes no transcript until the first message, so the id names
//! nothing, and `--resume` answers `No conversation found with session ID: …`
//! and exits 1 rather than opening an empty chat. Restoring a workspace then
//! greets the user with an error where their pane should be.
//!
//! No CLI answers "does this conversation exist", so this reads where Claude
//! keeps them and lets the frontend decide before it asks.
//!
//! The two flags are exact complements, which is what makes one check enough
//! — against claude 2.1.238, on the same id:
//!
//! | transcript | `--resume <id>`               | `--session-id <id>`      |
//! |------------|-------------------------------|--------------------------|
//! | present    | continues it                  | `Session ID … in use`, 1 |
//! | missing    | `No conversation found …`, 1  | starts one under that id |
//!
//! So a pane whose conversation is gone is not merely spared an error: it is
//! relaunched under the very id it already owned, and the next resume works.

use std::path::{Path, PathBuf};

use super::run_blocking;
use super::terminal_args::validate_session_id;

/// Claude's transcript root: one folder per project, each holding one
/// `<conversation-id>.jsonl` per conversation started there.
pub struct ConversationStore {
    projects: Option<PathBuf>,
}

impl ConversationStore {
    /// The transcript root for one account.
    ///
    /// Account-scoped rather than global: each login keeps its conversations
    /// in its own folder, so asking the first account whether a second
    /// account's pane can resume would answer about the wrong transcripts and
    /// send the user a "No conversation found" for one that exists.
    ///
    /// `None` means there is nowhere to look, which for this question is the
    /// same as finding nothing.
    pub fn detect(account_id: Option<&str>) -> Self {
        let account = account_id.unwrap_or(crate::provider_auth_home::DEFAULT_ACCOUNT);
        let config = crate::provider_auth_registry::Registry::load()
            .home("claude", account)
            .map(|home| home.credentials_dir())
            .ok();
        Self {
            projects: config.map(|dir| dir.join("projects")),
        }
    }

    /// Points the store at a fixture tree rather than the user's own.
    #[cfg(test)]
    pub(super) fn rooted_at(projects: PathBuf) -> Self {
        Self {
            projects: Some(projects),
        }
    }

    /// Whether `agent` could still resume the conversation `session` names.
    ///
    /// Only Claude both accepts an id at launch and resumes by it, so only
    /// Claude's answer comes off disk. Every other agent resumes by recency
    /// and ignores the id entirely — they have no id that can go missing, so
    /// the honest answer for them is yes.
    pub fn resumable(&self, agent: &str, session: &str) -> bool {
        if agent != "claude" {
            return true;
        }
        // The id becomes a file name below, so it is held to a plain UUID for
        // the same reason `configure_launch` holds it to one before it becomes
        // an argument: an id shaped like a path would be read as one.
        if validate_session_id(session).is_err() {
            return false;
        }
        self.projects
            .as_deref()
            .is_some_and(|projects| holds(projects, session))
    }
}

/// `--resume` finds an id in whichever project folder holds it, not only the
/// one matching the current directory — verified against claude 2.1.238 by
/// resuming a conversation from a different folder, which found it and kept
/// appending to the original file. Matching on the id alone therefore agrees
/// with the CLI, and avoids rebuilding a folder name out of a working
/// directory the pane may not be launched in again.
fn holds(projects: &Path, session: &str) -> bool {
    let transcript = format!("{session}.jsonl");
    let Ok(entries) = std::fs::read_dir(projects) else {
        return false;
    };
    entries
        .flatten()
        .any(|entry| entry.path().join(&transcript).is_file())
}

/// Asked before a suspended pane is resumed, so Vibyra can start it fresh
/// rather than hand the agent an id that will kill it.
#[tauri::command]
pub async fn agent_conversation_resumable(
    agent_id: String,
    session_id: String,
    account_id: Option<String>,
) -> Result<bool, String> {
    run_blocking(move || {
        Ok(ConversationStore::detect(account_id.as_deref()).resumable(&agent_id, &session_id))
    })
    .await
}
