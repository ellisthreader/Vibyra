//! Stopping sessions: hang up, give every process one shared grace period,
//! then kill what is left — and never signal a process that already exited.

use std::sync::atomic::Ordering;
use std::sync::Arc;
use std::time::{Duration, Instant};

use super::manager::PtyManager;
use super::session::Session;
use super::SessionId;

/// How long a hung-up process has to exit before it is killed outright; the
/// same allowance portable-pty's own `kill` gives.
const GRACE: Duration = Duration::from_millis(200);
const POLL: Duration = Duration::from_millis(10);

impl Session {
    /// Hangs up on the process and kills it if it outlives the grace period.
    ///
    /// portable-pty's `kill` sends SIGHUP to the child's pid even after the
    /// child exited and was reaped — when that pid may already belong to an
    /// unrelated process — and then sleeps in 50 ms steps with the child lock
    /// held. This checks first and polls without the lock.
    pub fn kill(&self) {
        stop_all([self]);
    }

    /// Sends the hang-up without waiting for it to land. False when there is
    /// nothing left to wait for.
    fn hang_up(&self) -> bool {
        let mut child = self.child.lock();
        if !matches!(child.try_wait(), Ok(None)) {
            return false;
        }
        #[cfg(unix)]
        if let Some(pid) = child.process_id() {
            // SAFETY: kill(2) takes plain integers. The child is unreaped —
            // try_wait just said so, under the lock every reaper takes — so
            // its pid is still its own.
            return unsafe { libc::kill(pid as libc::pid_t, libc::SIGHUP) } == 0;
        }
        // Windows terminates outright, so there is no grace to wait out.
        let _ = child.kill();
        false
    }

    fn has_exited(&self) -> bool {
        !matches!(self.child.lock().try_wait(), Ok(None))
    }

    fn force_kill(&self) {
        let mut child = self.child.lock();
        if !matches!(child.try_wait(), Ok(None)) {
            return;
        }
        #[cfg(unix)]
        if let Some(pid) = child.process_id() {
            // SAFETY: as in `hang_up`; checked unreaped under the same lock.
            unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
            return;
        }
        let _ = child.kill();
    }
}

/// Hangs up on every session at once, waits one grace period for all of
/// them — never one per session — and kills whatever is still running.
pub(super) fn stop_all<'a>(sessions: impl IntoIterator<Item = &'a Session>) {
    let mut running: Vec<&Session> = sessions.into_iter().filter(|s| s.hang_up()).collect();
    let deadline = Instant::now() + GRACE;
    while !running.is_empty() && Instant::now() < deadline {
        std::thread::sleep(POLL);
        running.retain(|session| !session.has_exited());
    }
    for session in running {
        session.force_kill();
    }
}

impl PtyManager {
    /// Stops every session. Called on quit, where stopping them one by one
    /// cost up to 200 ms each on the main thread.
    pub fn shutdown(&self) {
        self.shutdown.store(true, Ordering::SeqCst);
        let _ = self.flush_tx.try_send(());
        let sessions: Vec<Arc<Session>> = self.sessions.read().values().cloned().collect();
        stop_all(sessions.iter().map(Arc::as_ref));
    }

    /// Stops and forgets every session, returning the ids it closed.
    pub fn close_all(&self) -> Vec<SessionId> {
        let sessions: Vec<Arc<Session>> = self.sessions.read().values().cloned().collect();
        stop_all(sessions.iter().map(Arc::as_ref));
        let mut map = self.sessions.write();
        sessions
            .iter()
            .map(|session| {
                map.remove(&session.id);
                session.id
            })
            .collect()
    }
}
