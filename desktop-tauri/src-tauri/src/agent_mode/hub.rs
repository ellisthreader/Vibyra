//! The per-account home of Agent Mode: its database, its files, its live turns.
//!
//! Opened lazily on the first Agent Mode call and closed on sign-out. That
//! second half is the point of the type existing at all — Vibyra's account
//! boundary is what lets signing out reload the window and know nothing
//! leaked, and an Agent Mode that kept a database handle and three running
//! provider processes across that boundary would be the hole in it.
//!
//! Everything is scoped by the account's own opaque key, so two logins on one
//! machine have separate databases, separate agent home folders and separate
//! attachments — not merely separate rows.

use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;

use parking_lot::Mutex;
use vibyra_core::agentdb::AgentDb;

pub use super::world::AgentWorld;

pub(super) type Notifier = Arc<dyn Fn(&str, &str) + Send + Sync>;

/// Holds whichever account's world is currently open.
#[derive(Default)]
pub struct AgentHub {
    open: Mutex<Option<Arc<AgentWorld>>>,
    notifier: Mutex<Option<Notifier>>,
}

impl AgentHub {
    pub fn set_notifier(&self, notify: impl Fn(&str, &str) + Send + Sync + 'static) {
        *self.notifier.lock() = Some(Arc::new(notify));
    }
    /// The world for `scope`, opening it if this is the first call.
    ///
    /// A different scope closes the previous one first: two accounts are never
    /// open at once, which is what makes "sign out and nothing leaks" a
    /// property of the code rather than a habit of the callers.
    pub fn world(&self, scope: &str, config_root: &Path) -> Result<Arc<AgentWorld>, String> {
        let account = sanitize(scope);
        let mut open = self.open.lock();
        if let Some(world) = open.as_ref() {
            if world.account == account {
                return Ok(Arc::clone(world));
            }
        }
        if let Some(previous) = open.take() {
            previous.cancel_all();
        }
        let root = config_root.join("agent-mode").join(&account);
        std::fs::create_dir_all(&root).map_err(|error| {
            format!(
                "Vibyra could not create its agent folder at {}: {error}",
                root.display()
            )
        })?;
        vibyra_core::fsx::harden_dir(&root);
        let db = AgentDb::open(&root.join("agents.db")).map_err(|error| error.to_string())?;

        // Nothing survived the last shutdown, so anything still marked running
        // is a crash's leftover rather than work in progress.
        vibyra_core::agent_chats::reset_running(&db).map_err(|e| e.to_string())?;
        vibyra_core::agent_runs::recover(&db).map_err(|e| e.to_string())?;
        vibyra_core::routines::runs::reset_running(&db).map_err(|e| e.to_string())?;
        // The same goes for a decision a dead turn was waiting on: nobody is
        // listening for the answer, so the card must not offer one.
        vibyra_core::approvals::invalidate_orphans(&db).map_err(|e| e.to_string())?;

        let world = Arc::new(AgentWorld {
            db: Arc::new(db),
            notify: self
                .notifier
                .lock()
                .clone()
                .unwrap_or_else(|| Arc::new(|_, _| {})),
            root,
            account,
            running: Mutex::new(HashMap::new()),
            closed: std::sync::atomic::AtomicBool::new(false),
        });
        *open = Some(Arc::clone(&world));
        Ok(world)
    }

    /// The world if one is open, without opening one. What the scheduler asks:
    /// a routine must never be the thing that creates a signed-out account's
    /// database.
    pub fn current(&self) -> Option<Arc<AgentWorld>> {
        self.open.lock().clone()
    }

    /// Closes the open world, stopping every turn first.
    pub fn close(&self) {
        if let Some(world) = self.open.lock().take() {
            world.cancel_all();
        }
    }
}

/// Turns an account key into something that is only ever one path segment.
///
/// The key is opaque and comes from the backend, so it is not trusted to be a
/// directory name: anything outside a small alphabet becomes an underscore,
/// and an empty result falls back to a fixed name rather than to the parent.
fn sanitize(scope: &str) -> String {
    let cleaned: String = scope
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' {
                c
            } else {
                '_'
            }
        })
        .take(64)
        .collect();
    if cleaned.trim_matches('_').is_empty() {
        "account".into()
    } else {
        cleaned
    }
}

#[cfg(test)]
#[path = "hub_tests.rs"]
mod tests;
