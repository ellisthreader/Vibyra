//! Presentation PTYs are separate from ordinary terminals: no duplicate phone
//! sessions or second remote input path.
use super::SharedChats;
use crate::sink::{ChannelSink, TermEvent};
use parking_lot::Mutex;
use std::{collections::HashMap, sync::Arc};
use tauri::ipc::Channel;
use vibyra_core::pty::{FlushConfig, PtyManager, SessionId, SessionInfo, Visibility};

pub(super) struct CliTerminals {
    manager: Arc<PtyManager>,
    sink: Arc<ChannelSink>,
    sessions: Mutex<HashMap<String, SessionId>>,
}
impl Default for CliTerminals {
    fn default() -> Self {
        let sink = Arc::new(ChannelSink::default());
        let manager = PtyManager::new(sink.clone(), FlushConfig::default());
        Self {
            manager,
            sink,
            sessions: Mutex::new(HashMap::new()),
        }
    }
}
impl CliTerminals {
    pub fn sessions_for_engine(&self, engine: &vibyra_engine::Engine) -> Vec<String> {
        self.sessions
            .lock()
            .keys()
            .filter(|id| engine.owns_conversation(id))
            .cloned()
            .collect()
    }
    pub fn stop(&self, session: &str) {
        if let Some(id) = self.sessions.lock().remove(session) {
            let _ = self.manager.remove(id);
            self.sink.detach(id);
        }
    }
    pub fn shutdown(&self) {
        self.manager.shutdown();
    }
}
impl SharedChats {
    pub fn attach_cli(
        &self,
        session: &str,
        rows: u16,
        cols: u16,
        channel: Channel<TermEvent>,
    ) -> Result<SessionInfo, String> {
        if !(2..=500).contains(&rows) || !(10..=1000).contains(&cols) {
            return Err("Invalid terminal dimensions".into());
        }
        let _action = self.local_action.lock();
        let engine = self.engine(session)?;
        let mut sessions = self.cli.sessions.lock();
        let info = if let Some(info) = sessions.get(session).and_then(|id| {
            self.cli
                .manager
                .list()
                .into_iter()
                .find(|s| s.id == *id && s.alive)
        }) {
            info
        } else {
            if let Some(old) = sessions.remove(session) {
                let _ = self.cli.manager.remove(old);
                self.cli.sink.detach(old);
            }
            let mut spec = engine.codex_terminal(session)?;
            spec.rows = rows;
            spec.cols = cols;
            let info = self
                .cli
                .manager
                .create_session("codex", "Codex", &spec)
                .map_err(|e| e.to_string())?;
            sessions.insert(session.to_owned(), info.id);
            info
        };
        self.cli
            .manager
            .set_visibility(info.id, Visibility::Hibernated)
            .map_err(|e| e.to_string())?;
        self.cli.sink.attach(info.id, channel);
        self.cli
            .manager
            .resize(info.id, rows, cols)
            .map_err(|e| e.to_string())?;
        self.cli
            .manager
            .set_visibility(info.id, Visibility::Visible)
            .map_err(|e| e.to_string())?;
        Ok(info)
    }
    pub fn cli_write(&self, session: &str, data: &str) -> Result<(), String> {
        if data.len() > 1024 * 1024 {
            return Err("Terminal input is too large".into());
        }
        // Copied out so an attach in progress is never waited on while
        // writing, nor the map held while input is queued.
        let id = *self
            .cli
            .sessions
            .lock()
            .get(session)
            .ok_or("Terminal is not attached")?;
        self.cli
            .manager
            .write_input(id, data.as_bytes())
            .map_err(|e| e.to_string())
    }
    pub fn cli_resize(&self, session: &str, rows: u16, cols: u16) -> Result<(), String> {
        if !(2..=500).contains(&rows) || !(10..=1000).contains(&cols) {
            return Err("Invalid terminal dimensions".into());
        }
        let sessions = self.cli.sessions.lock();
        let id = sessions.get(session).ok_or("Terminal is not attached")?;
        self.cli
            .manager
            .resize(*id, rows, cols)
            .map_err(|e| e.to_string())
    }
    pub fn cli_visibility(&self, session: &str, visible: bool) -> Result<(), String> {
        let sessions = self.cli.sessions.lock();
        let Some(&id) = sessions.get(session) else {
            return Ok(());
        };
        // A released session is woken only by an attach, which resyncs.
        let released = self
            .cli
            .manager
            .list()
            .iter()
            .any(|info| info.id == id && info.visibility == Visibility::Hibernated);
        if released {
            return Ok(());
        }
        self.cli
            .manager
            .set_visibility(
                id,
                if visible {
                    Visibility::Visible
                } else {
                    Visibility::Hidden
                },
            )
            .map_err(|e| e.to_string())
    }
    /// Lets go of a view that is going away. Merely hiding it kept a disposed
    /// terminal attached and serialized its output every 250 ms for as long
    /// as the process ran; released, the session hibernates until
    /// `attach_cli` wakes it with a resync for the next view. Only the view
    /// still attached can release, so a late call from an unmounted one
    /// cannot cut off its replacement.
    pub fn cli_release(&self, session: &str, channel: u32) -> Result<(), String> {
        let sessions = self.cli.sessions.lock();
        match sessions.get(session) {
            Some(&id) if self.cli.sink.release(id, channel) => self
                .cli
                .manager
                .set_visibility(id, Visibility::Hibernated)
                .map_err(|e| e.to_string()),
            _ => Ok(()),
        }
    }
}
