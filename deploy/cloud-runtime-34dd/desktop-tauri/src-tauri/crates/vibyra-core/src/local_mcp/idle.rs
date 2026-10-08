//! The idle rule: a server nobody called for `idle_stop` is stopped, and starts
//! again on next use. A busy server (its lock is held by a call) is never waited for.

use super::slot::Slot;
use super::supervisor::Supervisor;
use std::sync::{Arc, Weak};
use std::time::Duration;

impl Supervisor {
    /// Stops servers idle for `idle_stop`. A busy server is skipped, not waited for.
    pub fn reap_idle(&self) -> usize {
        let slots: Vec<Arc<Slot>> = self
            .slots
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .values()
            .cloned()
            .collect();
        let mut stopped = 0;
        for slot in slots {
            let Ok(mut run) = slot.run.try_lock() else {
                continue;
            };
            let idle = run
                .last_used
                .is_some_and(|at| at.elapsed() >= self.limits.idle_stop);
            if run.conn.is_some() && idle {
                run.stop(&slot);
                stopped += 1;
            }
        }
        stopped
    }

    /// A background thread that applies the idle rule until the supervisor is dropped.
    pub fn spawn_janitor(self: &Arc<Self>) {
        let weak: Weak<Self> = Arc::downgrade(self);
        let every =
            (self.limits.idle_stop / 4).clamp(Duration::from_millis(50), Duration::from_secs(30));
        std::thread::spawn(move || loop {
            std::thread::sleep(every);
            let Some(supervisor) = weak.upgrade() else {
                return;
            };
            supervisor.reap_idle();
        });
    }
}
