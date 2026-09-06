mod control;
mod events;
mod git;
mod history;
mod journal;
mod launch;
mod preview;
mod projects;
mod sessions;
mod state;

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
}

impl Engine {
    pub fn new(state_dir: PathBuf, projects: Vec<(String, PathBuf)>) -> Result<Self, String> {
        let projects = projects::configure(projects)?;
        let journal = journal::Journal::open(&state_dir)?;
        let sessions = journal.restore()?;
        let shared = Arc::new(Mutex::new(State::new(projects, journal, sessions)));
        let sink = Arc::new(events::Sink(Arc::clone(&shared)));
        let config = FlushConfig {
            scrollback_cap: 256 * 1024,
            ..FlushConfig::default()
        };
        let ptys = PtyManager::new(sink, config);
        Ok(Self { shared, ptys })
    }

    pub fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        if device.is_empty() || device.len() > 128 || !params.is_object() {
            return Err("invalid authenticated request".into());
        }
        match method {
            "host.state" => Ok(self.shared.lock().snapshot()),
            "session.create" => self.create(device, &params),
            "session.list" => self.shared.lock().history(&params, 48 * 1024),
            "session.snapshot" => self.snapshot(&params),
            "session.claim" => self.claim(device, &params),
            "session.input" => self.input(device, &params),
            "session.resize" => self.resize(device, &params),
            "session.release" => self.release(device, &params),
            "session.stop" => self.stop(device, &params),
            "project.files" => self.files(&params),
            "project.read" => self.read(&params),
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
