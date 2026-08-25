//! Whether the conversation a pane wants to resume still exists.
//!
//! Vibyra pins a conversation id when a Claude pane launches (`--session-id`)
//! and names that same id when the pane is resumed (`--resume`). Codex chooses
//! its own id, which native session persistence captures from its open rollout
//! file and later supplies to `codex resume <id>`.
//!
//! Both CLIs treat an id they cannot resolve as fatal rather than as a reason
//! to open an empty chat, and both therefore need the same preflight:
//!
//! | CLI    | on an id it cannot find                        |
//! |--------|------------------------------------------------|
//! | claude | `No conversation found with session ID: …`, 1  |
//! | codex  | `ERROR: No saved session found with ID …`, 1   |
//!
//! Each reaches that state a different way. Claude writes no transcript until
//! the first message, so a pane opened and closed without a word typed owns an
//! id that names nothing. Codex's ids are real when captured but outlive the
//! rollouts they point at — a conversation can be archived, cleaned up, or
//! captured from a subagent thread that has since gone. Either way, restoring
//! a workspace greets the user with a dead pane where their work should be.
//!
//! No CLI answers "does this conversation exist", so this reads where each
//! provider keeps its transcripts and lets the frontend decide before it asks.
//! See `codex_transcripts` for the Codex half.
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

use super::claude_transcripts;
use super::codex_transcripts;
use super::run_blocking;
use super::terminal_args::validate_session_id;

/// Where one provider account keeps its conversations.
pub struct ConversationStore {
    /// Claude's transcript root: one folder per project, each holding one
    /// `<conversation-id>.jsonl` per conversation started there.
    projects: Option<PathBuf>,
    /// Codex's rollout root: `<year>/<month>/<day>/rollout-…-<id>.jsonl`.
    sessions: Option<PathBuf>,
}

impl ConversationStore {
    /// The transcript root for one agent on one account.
    ///
    /// Account-scoped rather than global: each login keeps its conversations
    /// in its own folder, so asking the first account whether a second
    /// account's pane can resume would answer about the wrong transcripts and
    /// send the user a "No conversation found" for one that exists.
    ///
    /// Agent-scoped for the same reason. The two providers keep their
    /// conversations in different places under different roots, and resolving
    /// Claude's home to answer about a Codex pane would look for a rollout
    /// somewhere no rollout has ever been written.
    ///
    /// `None` means there is nowhere to look; what that implies differs per
    /// provider, and each branch of `resumable` says which way it reads it.
    pub fn detect(agent: &str, account_id: Option<&str>) -> Self {
        let account = account_id.unwrap_or(crate::provider_auth_home::DEFAULT_ACCOUNT);
        let home = crate::provider_auth_registry::Registry::load()
            .home(agent, account)
            .map(|home| home.credentials_dir())
            .ok();
        Self {
            projects: home.as_deref().map(|dir| dir.join("projects")),
            sessions: home.as_deref().map(|dir| dir.join("sessions")),
        }
    }

    /// Points the store at a fixture tree rather than the user's own.
    #[cfg(test)]
    pub(super) fn rooted_at(projects: PathBuf) -> Self {
        Self {
            projects: Some(projects),
            sessions: None,
        }
    }

    /// The same, for the Codex side of the store.
    #[cfg(test)]
    pub(super) fn rooted_at_sessions(sessions: PathBuf) -> Self {
        Self {
            projects: None,
            sessions: Some(sessions),
        }
    }

    /// Whether `agent` could still resume the conversation `session` names.
    ///
    /// Agents not listed here resume by recency or not at all: they are never
    /// handed an id, so there is nothing to check and nothing that can kill
    /// the pane.
    pub fn resumable(&self, agent: &str, session: &str) -> bool {
        match agent {
            "claude" => self.claude_holds(session),
            "codex" => self.codex_holds(session),
            _ => true,
        }
    }

    /// Nowhere to look reads as no conversation. Claude's transcripts sit in a
    /// folder it creates on first use, so a missing root means this account has
    /// never written one — and relaunching mints the id it already owned.
    fn claude_holds(&self, session: &str) -> bool {
        if invalid(session) {
            return false;
        }
        self.projects
            .as_deref()
            .is_some_and(|projects| claude_transcripts::holds_conversation(projects, session))
    }

    /// Nowhere to look reads as *unknown*, and unknown resumes.
    ///
    /// The asymmetry with Claude is deliberate. A Codex id is only ever
    /// persisted after being read from a rollout that existed, so the id is
    /// good until proven otherwise, and a preflight that cannot find
    /// `CODEX_HOME` must not veto every Codex pane on the machine. Only a root
    /// that exists and does not hold the rollout is evidence of absence.
    fn codex_holds(&self, session: &str) -> bool {
        if invalid(session) {
            return false;
        }
        self.sessions
            .as_deref()
            .is_none_or(|sessions| codex_transcripts::holds_conversation(sessions, session))
    }

    /// The folder this agent's transcripts hang off for this account.
    ///
    /// Carrying a conversation between accounts needs both ends of the move,
    /// and the two providers root theirs differently. Agents that resume by
    /// recency keep nothing addressable, so they get `None`.
    pub fn transcript_root(&self, agent: &str) -> Option<&Path> {
        match agent {
            "claude" => self.projects.as_deref(),
            "codex" => self.sessions.as_deref(),
            _ => None,
        }
    }

    /// Where `session` sits beneath `transcript_root`, if this account has it.
    pub fn locate(&self, agent: &str, session: &str) -> Option<PathBuf> {
        if invalid(session) {
            return None;
        }
        let root = self.transcript_root(agent)?;
        match agent {
            "claude" => claude_transcripts::find_conversation(root, session),
            "codex" => codex_transcripts::find_conversation(root, session),
            _ => None,
        }
    }
}

/// An id becomes a file name in both lookups, so it is held to a plain UUID
/// for the same reason `configure_launch` holds it to one before it becomes an
/// argument: an id shaped like a path would be read as one.
fn invalid(session: &str) -> bool {
    validate_session_id(session).is_err()
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
        Ok(ConversationStore::detect(&agent_id, account_id.as_deref())
            .resumable(&agent_id, &session_id))
    })
    .await
}
