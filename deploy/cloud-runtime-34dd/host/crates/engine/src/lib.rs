mod activity;
pub use activity::Activity;
mod agent_history;
mod agent_session;
mod agent_titles;
mod ai_accounts;
mod codex_discovery;
mod control;
mod conversation;
mod desktop_launch;
mod embedded;
pub use desktop_launch::DesktopConversationOptions;
mod events;
mod external_read;
mod git;
mod history;
mod journal;
pub use journal::remove_unowned_state;
mod launch;
mod preview;
mod preview_status;
pub use preview_status::{PreviewRunProvider, PreviewStatusProvider, RunOutcome, RunRequest};
mod proc_identity;
mod project_identity;
#[cfg(windows)]
pub use project_identity::windows_directory_identity;
#[cfg(unix)]
mod project_snapshot;
#[cfg(unix)]
pub use project_snapshot::{ProjectSnapshot, SnapshotFile};
mod funded_bindings;
#[cfg(all(test, unix))]
mod project_snapshot_tests;
mod projects;
mod provider_policy;
pub use projects::MAX_PROJECTS;
#[cfg(test)]
mod project_limit_tests;
mod resume;
#[cfg(test)]
mod resume_tests;
mod scaffold;
mod scaffold_run;
#[cfg(test)]
mod scaffold_tests;
mod search;
mod sessions;
mod state;
mod vibes_path;
mod vibes_tools;
mod vibes_write;

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    path::PathBuf,
    sync::{mpsc, Arc},
};
use vibyra_core::pty::{FlushConfig, PtyManager};

use state::{Shared, State};

/// The process owns this engine. Network connections only borrow it.
pub struct Engine {
    pub(crate) shared: Shared,
    pub(crate) ptys: Arc<PtyManager>,
    pub(crate) conversation_launch: embedded::ConversationLaunch,
    pub(crate) scaffolds: scaffold::SharedScaffolds,
    /// Where Claude and Codex keep their transcripts on this computer.
    pub(crate) homes: agent_session::Homes,
    /// Provider sign-in for a headless Host. `None` for a read-only desktop
    /// vault, whose Mac app owns its own accounts.
    pub(crate) accounts: Option<Arc<ai_accounts::Manager>>,
    /// Providers the account turned off for Vibyra Cloud (see provider_policy).
    pub(crate) disabled: provider_policy::Disabled,
}

impl Engine {
    pub fn new(state_dir: PathBuf, projects: Vec<(String, PathBuf)>) -> Result<Self, String> {
        let projects = projects::configure(projects)?;
        Self::from_projects(state_dir, projects, Default::default())
    }

    /// One project, opened without write access, whatever a caller later asks
    /// for it to do - built for a folder a person chose to expose reading only,
    /// such as a Vibyra Desktop vault. `write_file` is refused inside
    /// `vibes_tool` itself, not just left off the schema offered to the model.
    pub fn new_read_only(state_dir: PathBuf, name: String, path: PathBuf) -> Result<Self, String> {
        let project = projects::build(name, path, true)?;
        projects::within_limit(std::slice::from_ref(&project))?;
        let mut engine = Self::from_projects(state_dir, vec![project], Default::default())?;
        engine.accounts = None;
        Ok(engine)
    }

    fn from_projects(
        state_dir: PathBuf,
        projects: Vec<state::Project>,
        conversation_launch: embedded::ConversationLaunch,
    ) -> Result<Self, String> {
        let journal = journal::Journal::open(&state_dir)?;
        let sessions = journal.restore()?;
        let conversations = journal.conversations()?;
        let projects = projects::with_adopted(projects, journal.adopted_projects()?);
        let shared = Arc::new(Mutex::new(State::new(projects, journal, sessions)));
        shared.lock().conversations = conversations;
        let sink = Arc::new(events::Sink(Arc::clone(&shared)));
        let config = FlushConfig {
            scrollback_cap: 256 * 1024,
            ..FlushConfig::default()
        };
        let ptys = PtyManager::new(sink, config);
        let engine = Self {
            shared,
            ptys,
            conversation_launch,
            scaffolds: Default::default(),
            homes: agent_session::Homes::from_env(),
            accounts: Some(Default::default()),
            disabled: Default::default(),
        };
        engine.refresh_resumable();
        Ok(engine)
    }

    pub fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        if device.is_empty() || device.len() > 128 || !params.is_object() {
            return Err("invalid authenticated request".into());
        }
        self.refuse_disabled(method, &params)?;
        match method {
            "vibes.bind" | "vibes.tool" => self.vibes_tool_with(device, method, &params, None),
            method if method.starts_with("scaffold.") => self.scaffold_handle(method, &params),
            "host.state" => {
                let mut state = self.shared.lock().snapshot();
                state["capabilities"]["conversationProviders"] =
                    serde_json::json!(self.offered_providers());
                if self.accounts.as_ref().is_some_and(|a| a.available()) {
                    state["capabilities"]["aiAccountsV1"] = json!(true);
                    state["capabilities"]["aiAccountsReplaceV1"] = json!(true);
                    // Recognizes Cloud setup-token logins; explicit account status is authoritative.
                    state["capabilities"]["cloudOAuthTokenStatusV1"] = json!(true);
                }
                Ok(state)
            }
            "session.create" if params["runner"] == "conversation" => {
                self.create_conversation(device, &params)
            }
            "session.create" => self.create(device, &params),
            method
                if method.starts_with("conversation.")
                    || method.starts_with("turn.")
                    || method == "decision.resolve"
                    || method == "question.answer" =>
            {
                self.conversation_handle(device, method, &params)
            }
            "session.list" => self.shared.lock().history(&params, 48 * 1024),
            "session.snapshot" => self.snapshot(&params),
            "session.claim" => self.claim(device, &params),
            "session.input" => self.input(device, &params),
            "session.resize" => self.resize(device, &params),
            "session.release" => self.release(device, &params),
            "session.stop" => self.stop(device, &params),
            "session.resume" => self.resume(&params),
            "agent.sessions" => self.agent_sessions(&params),
            method if method.starts_with("aiAccounts.") => match &self.accounts {
                Some(accounts) => accounts.handle(method, &params),
                None => Err("method not supported by host protocol 1".into()),
            },
            "project.rename" => {
                let id = text(&params, "projectId")?.to_owned();
                let name = text(&params, "name")?.to_owned();
                self.shared.lock().rename_project(&id, &name)
            }
            "project.forget" => {
                let id = text(&params, "projectId")?.to_owned();
                self.shared.lock().forget_project(&id)
            }
            "project.files" => self.files(&params),
            "project.read" => self.read(&params),
            "project.search" => self
                .project(&params)
                .and_then(|project| search::search(&project, &params)),
            "project.diff" => self.diff(&params),
            "project.status" => self.status(&params),
            "preview.fetch" => self.preview(&params),
            // Provider permission prompts remain in their real CLI terminal.
            "approval.list" => Ok(json!([])),
            "approval.resolve" => Err("approval does not exist or has expired".into()),
            _ => Err("method not supported by host protocol 1".into()),
        }
    }

    pub fn subscribe(&self) -> mpsc::Receiver<Value> {
        // A lagging connection is dropped rather than retaining unbounded output.
        let (tx, rx) = mpsc::sync_channel(256);
        self.shared.lock().subscribers.push(tx);
        rx
    }

    pub fn disconnected(&self, device: &str) {
        let mut state = self.shared.lock();
        for session in state.sessions.values_mut() {
            if session
                .lease
                .as_ref()
                .is_some_and(|lease| lease.device == device)
            {
                session.lease = None;
            }
        }
    }

    /// Running sessions of every kind this engine owns, terminal or
    /// conversation, so an embedding app can apply a plan's terminal limit.
    pub fn running_sessions(&self) -> usize {
        self.shared
            .lock()
            .sessions
            .values()
            .filter(|session| session.meta.status == "running")
            .count()
    }

    /// This is intentionally unavailable over the remote protocol.
    pub fn allow_preview(&self, project: &str, port: u16) -> Result<(), String> {
        let mut state = self.shared.lock();
        let project_id = state.resolve_project(project)?.id.clone();
        if port == 0 {
            return Err("preview port must be nonzero".into());
        }
        state.preview_ports.insert((project_id, port));
        Ok(())
    }
}

pub(crate) fn text<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value
        .get(key)
        .and_then(Value::as_str)
        .ok_or_else(|| format!("missing {key}"))
}

pub(crate) fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

pub(crate) fn identifier(value: &str) -> Result<(), String> {
    uuid::Uuid::parse_str(value)
        .map(|_| ())
        .map_err(|_| "invalid UUID".into())
}
