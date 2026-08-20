use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::RwLock;

use crate::error::{CoreError, CoreResult};

use super::buffer::Drained;
use super::flusher;
use super::session::{Session, SessionOptions};
use super::{LaunchSpec, SessionId, SessionInfo, Visibility};

pub trait OutputSink: Send + Sync + 'static {
    fn on_output(&self, id: SessionId, data: String);
    fn on_resync(&self, id: SessionId, snapshot: String);
    fn on_exit(&self, id: SessionId, code: Option<i32>);
}

#[derive(Debug, Clone)]
pub struct FlushConfig {
    pub tick: Duration,
    pub hidden_interval: Duration,
    pub pending_cap: usize,
    pub scrollback_cap: usize,
}

impl Default for FlushConfig {
    fn default() -> Self {
        Self {
            // The flusher delivers immediately on wake and then rests one
            // tick, so this only paces *sustained* output. 16 ms matches the
            // display rate — more IPC than that can't be rendered anyway.
            tick: Duration::from_millis(16),
            hidden_interval: Duration::from_millis(250),
            pending_cap: 1024 * 1024,
            scrollback_cap: 4 * 1024 * 1024,
        }
    }
}

pub struct PtyManager {
    sessions: Arc<RwLock<HashMap<SessionId, Arc<Session>>>>,
    sink: Arc<dyn OutputSink>,
    config: FlushConfig,
    next_id: AtomicU64,
    shutdown: Arc<AtomicBool>,
    flush_tx: SyncSender<()>,
}

impl PtyManager {
    pub fn new(sink: Arc<dyn OutputSink>, config: FlushConfig) -> Arc<Self> {
        let (flush_tx, flush_rx) = sync_channel(1);
        let manager = Arc::new(Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            sink,
            config,
            next_id: AtomicU64::new(1),
            shutdown: Arc::new(AtomicBool::new(false)),
            flush_tx,
        });
        flusher::spawn(
            Arc::clone(&manager.sessions),
            Arc::clone(&manager.sink),
            Arc::clone(&manager.shutdown),
            manager.config.clone(),
            flush_rx,
        );
        manager
    }

    pub fn create_session(
        &self,
        agent_id: &str,
        title: &str,
        spec: &LaunchSpec,
    ) -> CoreResult<SessionInfo> {
        let id = self.next_id.fetch_add(1, Ordering::SeqCst);
        let sink = Arc::clone(&self.sink);
        let sessions = Arc::clone(&self.sessions);
        let config = self.config.clone();
        let session = Session::spawn(
            SessionOptions {
                id,
                agent_id,
                title,
                pending_cap: config.pending_cap,
                scrollback_cap: config.scrollback_cap,
            },
            spec,
            self.flush_tx.clone(),
            move |session_id, code| {
                if let Some(session) = sessions.read().get(&session_id).cloned() {
                    match session.output.lock().drain() {
                        Drained::Chunk(text) => sink.on_output(session_id, text),
                        Drained::Resync(snapshot) => sink.on_resync(session_id, snapshot),
                        Drained::Nothing => {}
                    }
                }
                sink.on_exit(session_id, code);
            },
        )?;
        let info = describe(&session);
        self.sessions.write().insert(id, session);
        let _ = self.flush_tx.try_send(());
        Ok(info)
    }

    fn session(&self, id: SessionId) -> CoreResult<Arc<Session>> {
        self.sessions
            .read()
            .get(&id)
            .cloned()
            .ok_or(CoreError::SessionNotFound(id))
    }

    pub fn write_input(&self, id: SessionId, data: &[u8]) -> CoreResult<()> {
        self.session(id)?.write_input(data)
    }

    pub fn resize(&self, id: SessionId, rows: u16, cols: u16) -> CoreResult<()> {
        self.session(id)?.resize(rows, cols)
    }

    pub fn set_visibility(&self, id: SessionId, visibility: Visibility) -> CoreResult<()> {
        let session = self.session(id)?;
        let was = session.output.lock().visibility;
        session.set_visibility(visibility);
        if was == Visibility::Hibernated && visibility != Visibility::Hibernated {
            let snapshot = session.output.lock().force_resync();
            self.sink.on_resync(id, snapshot);
        }
        let _ = self.flush_tx.try_send(());
        Ok(())
    }

    pub fn snapshot(&self, id: SessionId) -> CoreResult<String> {
        Ok(self.session(id)?.output.lock().snapshot())
    }

    pub fn kill(&self, id: SessionId) -> CoreResult<()> {
        self.session(id)?.kill();
        Ok(())
    }

    pub fn remove(&self, id: SessionId) -> CoreResult<()> {
        let session = self.session(id)?;
        if session.is_alive() {
            session.kill();
        }
        self.sessions.write().remove(&id);
        Ok(())
    }

    pub fn list(&self) -> Vec<SessionInfo> {
        let mut infos: Vec<SessionInfo> =
            self.sessions.read().values().map(|s| describe(s)).collect();
        infos.sort_by_key(|info| info.id);
        infos
    }

    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        let _ = self.flush_tx.try_send(());
        for session in self.sessions.read().values() {
            session.kill();
        }
    }
}

impl Drop for PtyManager {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn describe(session: &Session) -> SessionInfo {
    SessionInfo {
        id: session.id,
        agent_id: session.agent_id.clone(),
        title: session.title.lock().clone(),
        program: session.program.clone(),
        cwd: session.cwd.clone(),
        visibility: session.output.lock().visibility,
        alive: session.is_alive(),
        exit_code: *session.exit_code.lock(),
    }
}
