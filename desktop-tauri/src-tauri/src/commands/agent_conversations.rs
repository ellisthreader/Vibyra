//! Account-scoped checks before handing a saved conversation ID to its CLI.

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
    pub fn detect(agent: &str, account_id: Option<&str>) -> Self {
        let account = account_id.unwrap_or(crate::provider_auth_home::DEFAULT_ACCOUNT);
        let config = crate::provider_auth_registry::Registry::load()
            .home(agent, account)
            .map(|home| home.credentials_dir())
            .ok();
        Self {
            projects: config.map(|dir| {
                dir.join(if agent == "codex" {
                    "sessions"
                } else {
                    "projects"
                })
            }),
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
    /// Claude and Codex have known account-scoped transcript layouts. Other
    /// providers validate their IDs themselves when resumed; no recency guess
    /// is substituted here.
    pub fn resumable(&self, agent: &str, session: &str) -> bool {
        if !matches!(agent, "claude" | "codex") {
            return true;
        }
        // The id becomes a file name below, so it is held to a plain UUID for
        // the same reason `configure_launch` holds it to one before it becomes
        // an argument: an id shaped like a path would be read as one.
        if validate_session_id(session).is_err() {
            return false;
        }
        self.projects.as_deref().is_some_and(|projects| {
            if agent == "codex" {
                holds_codex(projects, session, 0)
            } else {
                holds(projects, session)
            }
        })
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

/// Check before resuming. Missing history leaves the saved pane visible with
/// an explicit New chat option; it never silently changes conversations.
#[tauri::command]
pub async fn agent_conversation_resumable(
    agent_id: String,
    session_id: String,
    account_id: Option<String>,
) -> Result<bool, String> {
    run_blocking(move || {
        Ok(ConversationStore::detect(&agent_id, account_id.as_deref())
            .resumable(&agent_id, &session_id))
    })
    .await
}

/// Codex rollouts live under sessions/year/month/day. Ignore symlinked trees.
fn holds_codex(root: &Path, session: &str, depth: usize) -> bool {
    let Ok(entries) = std::fs::read_dir(root) else {
        return false;
    };
    for entry in entries.flatten() {
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        if kind.is_file()
            && entry
                .file_name()
                .to_string_lossy()
                .ends_with(&format!("-{session}.jsonl"))
        {
            return true;
        }
        if kind.is_dir() && depth < 3 && holds_codex(&entry.path(), session, depth + 1) {
            return true;
        }
    }
    false
}
