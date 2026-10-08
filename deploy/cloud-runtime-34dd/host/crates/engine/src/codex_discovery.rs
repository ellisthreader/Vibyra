//! A Codex terminal does not name its own conversation. Once it has one, the
//! rollout file it holds open does, so a short-lived thread asks `/proc` until
//! that file appears and files the id with the session in the journal.
use crate::{proc_identity, Engine};
use std::{
    path::PathBuf,
    sync::Arc,
    time::{Duration, Instant},
};

/// How often to look: quickly at first (Codex opens its rollout within a
/// moment of starting or of the first message), then rarely, then give up.
#[derive(Clone, Copy)]
pub(crate) struct Schedule {
    pub quick: Duration,
    pub quick_for: Duration,
    pub slow: Duration,
    pub give_up: Duration,
}

impl Default for Schedule {
    fn default() -> Self {
        Self {
            quick: Duration::from_millis(500),
            quick_for: Duration::from_secs(10),
            slow: Duration::from_secs(5),
            give_up: Duration::from_secs(600),
        }
    }
}

impl Engine {
    pub(crate) fn watch_codex_identity(&self, session_id: String, native: u64) {
        // Only Linux has the `/proc` this reads; the VM is Linux.
        if !cfg!(target_os = "linux") {
            return;
        }
        self.watch_codex(session_id, native, "/proc".into(), Schedule::default());
    }

    /// Holds only weak references: the thread never keeps an engine, or the
    /// terminals it owns, alive. It ends when the id is found, the session is
    /// no longer running, the engine is gone, or the schedule runs out.
    pub(crate) fn watch_codex(
        &self,
        session_id: String,
        native: u64,
        proc_root: PathBuf,
        schedule: Schedule,
    ) {
        let shared = Arc::downgrade(&self.shared);
        let ptys = Arc::downgrade(&self.ptys);
        let codex_home = self.homes.codex.clone();
        let _ = std::thread::Builder::new()
            .name("vibyra-codex-id".into())
            .spawn(move || {
                let started = Instant::now();
                while started.elapsed() < schedule.give_up {
                    let wait = if started.elapsed() < schedule.quick_for {
                        schedule.quick
                    } else {
                        schedule.slow
                    };
                    std::thread::sleep(wait);
                    let (Some(shared), Some(ptys)) = (shared.upgrade(), ptys.upgrade()) else {
                        return;
                    };
                    let waiting = shared.lock().sessions.get(&session_id).is_some_and(|s| {
                        s.meta.status == "running"
                            && s.native_id == Some(native)
                            && s.agent_session_id.is_none()
                    });
                    if !waiting {
                        return;
                    }
                    let Ok(Some(pid)) = ptys.process_id(native) else {
                        continue;
                    };
                    let Some(id) = proc_identity::discover(&proc_root, pid, &codex_home) else {
                        continue;
                    };
                    let mut state = shared.lock();
                    if let Some(session) = state.sessions.get_mut(&session_id) {
                        if session.agent_session_id.is_none() {
                            session.agent_session_id = Some(id);
                            let _ = state.journal.save(&state.sessions[&session_id]);
                        }
                    }
                    return;
                }
            });
    }
}
