//! Keyboard focus in a shared window, reported to the phone in the same shape
//! as the Mac adapter: whether a text field has focus, which keyboard suits
//! it, where it is, and a map of the visible text fields. Never field text.
//!
//! Each frame gets the latest reading at once; one reader thread per window
//! refreshes it, so a busy or hung application never holds back the picture.
//! UI Automation also wants its client on one thread.

use super::backend::{Backend, Geometry};
use super::fields::fraction;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::Arc;
use std::time::{Duration, Instant};

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
}

#[derive(Default)]
pub(super) struct Tracker {
    seen: Arc<Mutex<Seen>>,
    reader: Mutex<Option<SyncSender<Geometry>>>,
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

    fn cached(&self) -> Value {
        let seen = self.seen.lock();
        let mut state = seen.latest.clone().unwrap_or_else(
            || json!({"v":1,"access":true,"editable":false,"front":false,"serial":seen.serial}),
        );
        state["fields"] = Value::Array(seen.fields.clone());
        state
    }

    /// Reads focus now, waiting on the application: around a tap.
    pub fn measure(&self, backend: &'static dyn Backend, window: &Geometry) -> Value {
        measure(&self.seen, backend, window)
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
        self.seen.lock().scanned = None;
        // Observe the delivered input once even when injection used the budget.
        let mut state = self.measure(backend, window);
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
            state = self.measure(backend, window);
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
        let mut reader = self.reader.lock();
        if reader.is_none() {
            let (send, receive) = sync_channel::<Geometry>(1);
            let seen = Arc::clone(&self.seen);
            let spawned = std::thread::Builder::new()
                .name("vibyra-window-focus".into())
                .spawn(move || {
                    // Ends when the capture, and so the sender, is gone.
                    while let Ok(window) = receive.recv() {
                        measure(&seen, backend, &window);
                        scan(&seen, backend, &window);
                    }
                });
            if spawned.is_ok() {
                *reader = Some(send);
            }
        }
        if let Some(send) = reader.as_ref() {
            let _ = send.try_send(window.clone());
        }
    }
}

fn measure(seen: &Mutex<Seen>, backend: &'static dyn Backend, window: &Geometry) -> Value {
    let focused = backend.focus(window).unwrap_or_default();
    let field = focused.field.as_ref();
    let mut state = json!({
        "v": 1, "access": true, "front": focused.front,
        "editable": field.is_some(), "kind": field.map_or("text", |f| f.kind),
    });
    if let Some(field) = field {
        state["label"] = json!(field.label.chars().take(60).collect::<String>());
        if let Some(empty) = field.empty {
            state["empty"] = json!(empty);
        }
        if let Some(rect) = field.rect.and_then(|r| fraction(r, window)) {
            state["field"] = json!(rect);
        }
        if let Some(caret) = field.caret.and_then(|r| fraction(r, window)) {
            state["caret"] = json!(caret);
        }
    }
    let signature = format!("{}|{}", focused.identity, field.map_or("none", |f| f.kind));
    let mut seen = seen.lock();
    if seen.identity != signature {
        seen.identity = signature;
        seen.serial += 1;
        seen.unchanged = false;
    }
    state["serial"] = json!(seen.serial);
    seen.latest = Some(state.clone());
    state["fields"] = Value::Array(seen.fields.clone());
    state
}

/// Maps the window's text fields again when it may have changed: slow on busy
/// windows, so only from the reader thread, and at most every 750 ms.
fn scan(seen: &Mutex<Seen>, backend: &'static dyn Backend, window: &Geometry) {
    {
        let mut seen = seen.lock();
        let due = seen.scanned.is_none()
            || (!seen.unchanged && seen.scanned.is_some_and(|at| at.elapsed() >= RESCAN));
        if !due {
            return;
        }
        seen.unchanged = true;
    }
    let fields = backend
        .fields(window)
        .into_iter()
        .take(48)
        .filter_map(|field| {
            let mut entry = fraction(field.rect?, window)?.map(|v| json!(v)).to_vec();
            entry.push(json!(field.kind));
            Some(Value::Array(entry))
        })
        .collect();
    let mut seen = seen.lock();
    seen.fields = fields;
    seen.scanned = Some(Instant::now());
}
