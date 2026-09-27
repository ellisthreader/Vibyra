//! A small account-scoped, metadata-only retry buffer. The server remains the
//! authority for consent; a saved choice never enables collection on its own.

use std::collections::VecDeque;
use std::path::PathBuf;

use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::Value;

const MAX_QUEUED: usize = 100;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Choice {
    #[default]
    Unknown,
    Declined,
    Aggregate,
    Linked,
}

impl Choice {
    pub fn enabled(self) -> bool {
        matches!(self, Self::Aggregate | Self::Linked)
    }
}

#[derive(Default, Deserialize, Serialize)]
struct Saved {
    scope: String,
    choice: Choice,
    pending_decline: bool,
    queue: VecDeque<Value>,
}

#[derive(Clone, Copy)]
pub struct Status {
    pub choice: Choice,
    pub pending_decline: bool,
}

struct Runtime {
    saved: Saved,
    verified: bool,
}

pub struct AnalyticsStore {
    path: PathBuf,
    inner: Mutex<Runtime>,
    pub flush_lock: tokio::sync::Mutex<()>,
}

impl AnalyticsStore {
    pub fn load(path: PathBuf) -> Self {
        let saved = std::fs::read(&path)
            .ok()
            .filter(|bytes| bytes.len() <= 100_000)
            .and_then(|bytes| serde_json::from_slice::<Saved>(&bytes).ok())
            .unwrap_or_default();
        Self {
            path,
            inner: Mutex::new(Runtime {
                saved,
                verified: false,
            }),
            flush_lock: tokio::sync::Mutex::new(()),
        }
    }

    pub fn bind(&self, scope: &str) -> Status {
        let mut inner = self.inner.lock();
        if inner.saved.scope != scope {
            inner.saved = Saved {
                scope: scope.to_owned(),
                ..Saved::default()
            };
            inner.verified = false;
            self.persist(&inner.saved);
        }
        Status {
            choice: inner.saved.choice,
            pending_decline: inner.saved.pending_decline,
        }
    }

    pub fn set_verified(&self, scope: &str, choice: Choice) {
        let mut inner = self.inner.lock();
        if inner.saved.scope != scope {
            return;
        }
        inner.saved.choice = choice;
        inner.saved.pending_decline = false;
        inner.verified = true;
        if !choice.enabled() {
            inner.saved.queue.clear();
        }
        self.persist(&inner.saved);
    }

    pub fn unverify(&self, scope: &str) {
        let mut inner = self.inner.lock();
        if inner.saved.scope == scope {
            inner.verified = false;
        }
    }

    /// Withdrawal takes effect before the network request, including offline.
    pub fn decline_now(&self, scope: &str) {
        let mut inner = self.inner.lock();
        if inner.saved.scope != scope {
            return;
        }
        inner.saved.choice = Choice::Declined;
        inner.saved.pending_decline = true;
        inner.saved.queue.clear();
        inner.verified = false;
        self.persist(&inner.saved);
    }

    pub fn enqueue(&self, scope: &str, mut event: Value) -> bool {
        let mut inner = self.inner.lock();
        if inner.saved.scope != scope || !inner.verified || !inner.saved.choice.enabled() {
            return false;
        }
        if inner.saved.queue.len() == MAX_QUEUED {
            inner.saved.queue.pop_front();
        }
        event["consent_mode"] = Value::String(
            match inner.saved.choice {
                Choice::Linked => "linked",
                _ => "aggregate",
            }
            .into(),
        );
        inner.saved.queue.push_back(event);
        self.persist(&inner.saved);
        true
    }

    pub fn first(&self, scope: &str) -> Option<Value> {
        let inner = self.inner.lock();
        if inner.saved.scope != scope || !inner.verified || !inner.saved.choice.enabled() {
            return None;
        }
        inner.saved.queue.front().cloned()
    }

    pub fn remove_first(&self, scope: &str, event_id: &str) {
        let mut inner = self.inner.lock();
        if inner.saved.scope != scope {
            return;
        }
        if inner
            .saved
            .queue
            .front()
            .and_then(|v| v.get("event_id"))
            .and_then(Value::as_str)
            != Some(event_id)
        {
            return;
        }
        inner.saved.queue.pop_front();
        self.persist(&inner.saved);
    }

    pub fn clear_session(&self) {
        let mut inner = self.inner.lock();
        inner.saved.queue.clear();
        inner.verified = false;
        self.persist(&inner.saved);
    }

    fn persist(&self, saved: &Saved) {
        let Some(parent) = self.path.parent() else {
            return;
        };
        if std::fs::create_dir_all(parent).is_err() {
            return;
        }
        let Ok(bytes) = serde_json::to_vec(saved) else {
            return;
        };
        let Ok(mut file) = tempfile::NamedTempFile::new_in(parent) else {
            return;
        };
        use std::io::Write;
        if file.write_all(&bytes).is_ok() {
            let _ = file.persist(&self.path);
        }
    }
}
