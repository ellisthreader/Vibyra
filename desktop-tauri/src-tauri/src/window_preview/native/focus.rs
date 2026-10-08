//! Keyboard focus in a shared window, reported to the phone in the same shape
//! as the Mac adapter: whether a text field has focus, which keyboard suits
//! it, where it is, and a map of the visible text fields. Never field text.
//!
//! Each frame gets the latest reading at once; one reader thread per window
//! refreshes it, so a busy or hung application never holds back the picture.
//! UI Automation also wants its client on one thread.

use super::backend::{Backend, Geometry};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};

#[path = "focus_reader.rs"]
mod reader;
use reader::Reader;
#[path = "focus_reading.rs"]
mod reading;
use reading::{measure, scan};

/// A text field in desktop coordinates, as the input backend uses them.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Field {
    pub kind: &'static str,
    pub rect: Option<[f64; 4]>,
    pub caret: Option<[f64; 4]>,
    pub label: String,
    pub empty: Option<bool>,
}

/// What has keyboard focus: `identity` changes whenever focus moves.
#[derive(Clone, Debug, Default)]
pub(crate) struct Focused {
    pub front: bool,
    pub identity: String,
    pub field: Option<Field>,
}

#[derive(Default)]
struct Seen {
    identity: String,
    serial: u64,
    latest: Option<Value>,
    fields: Vec<Value>,
    scanned: Option<Instant>,
    unchanged: bool,
    rescan: u64,
}

#[derive(Default)]
pub(super) struct Tracker {
    seen: Arc<Mutex<Seen>>,
    reader: Mutex<Option<Reader>>,
}

const RESCAN: Duration = Duration::from_millis(750);
pub(super) const TAP_WAIT: Duration = Duration::from_millis(210);
const TAP_POLL: Duration = Duration::from_millis(30);

impl Tracker {
    /// For each frame: the latest reading, never waiting on the application.
    pub fn current(&self, backend: &'static dyn Backend, window: &Geometry) -> Value {
        self.wake(backend, window);
        self.cached()
    }

    pub(super) fn cached(&self) -> Value {
        let seen = self.seen.lock();
        let mut state = seen.latest.clone().unwrap_or_else(
            || json!({"v":1,"access":true,"editable":false,"front":false,"serial":seen.serial}),
        );
        state["fields"] = Value::Array(seen.fields.clone());
        state
    }

    /// A fresh reply from the single reader, with a bounded caller wait.
    pub fn measure(
        &self,
        backend: &'static dyn Backend,
        window: &Geometry,
        deadline: Instant,
    ) -> Value {
        let reply = self.with_reader(backend, |reader| reader.observe(window, deadline));
        reply.flatten().unwrap_or_else(|| self.cached())
    }

    /// The state once a tap has had a moment to move keyboard focus.
    pub fn settled(
        &self,
        backend: &'static dyn Backend,
        window: &Geometry,
        before: u64,
        deadline: Instant,
        mut wait: impl FnMut(Duration),
    ) -> Value {
        // The tap may have changed the layout: map the fields again.
        {
            let mut seen = self.seen.lock();
            seen.scanned = None;
            seen.rescan += 1;
        }
        // Queue a distinct post-input read. If injection exhausted the polling
        // budget, allow at most one poll interval for that fresh reply.
        let first_reply = deadline.max(Instant::now() + TAP_POLL);
        let mut state = self.measure(backend, window, first_reply);
        while state["serial"].as_u64() == Some(before) {
            // Application reads and late wakeups share the same wait budget.
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                break;
            }
            wait(TAP_POLL.min(remaining));
            if Instant::now() >= deadline {
                break;
            }
            state = self.measure(backend, window, deadline);
        }
        // A background observation may have advanced while the poll was asleep.
        self.cached()
    }

    /// New pixels arrived, so the text fields may have moved.
    pub fn frame_changed(&self) {
        self.seen.lock().unchanged = false;
    }

    /// Asks the reader thread (started on first use) for a fresh reading.
    /// A reading already queued covers this one.
    fn wake(&self, backend: &'static dyn Backend, window: &Geometry) {
        self.with_reader(backend, |reader| reader.refresh(window));
    }

    fn with_reader<T>(
        &self,
        backend: &'static dyn Backend,
        work: impl FnOnce(&Reader) -> T,
    ) -> Option<T> {
        let reader = {
            let mut reader = self.reader.lock();
            if reader.is_none() {
                *reader = Reader::start(backend, Arc::clone(&self.seen));
            }
            reader.clone()
        };
        reader.as_ref().map(work)
    }
}
