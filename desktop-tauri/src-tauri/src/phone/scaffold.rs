//! Starting a project from the phone on a Mac running Vibyra itself.
//!
//! The standalone Host answers the same `scaffold.*` methods, and the phone's
//! wizard cannot tell the two apart: the plan it sends is the one the desktop
//! wizard builds, and `vibyra_core::scaffold` runs it here exactly as it runs
//! it there. What differs is the ending. The Host owns the folders it shares,
//! so it adopts the new one itself; this adapter owns no project list at all —
//! the window publishes it — so the built folder is handed to the window to
//! open, the way a phone's terminal request is handed to it.
//!
//! A build runs on its own thread and reports as `scaffold.step`,
//! `scaffold.output` and `scaffold.done`. Nothing here waits on a process
//! inside a request: that would hold the connection's event pump with it.

use super::requests::TerminalRequests;
use super::workspace::SharedWorkspace;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    sync::{atomic::AtomicBool, Arc},
    time::Duration,
};

// The three halves of this adapter, kept apart for the 200-line standard: the
// rules, the methods, and the thread that runs a build. Children rather than
// siblings, so `Run` and `Scaffolds` below stay private to this module.
//
// The paths are spelled out because `examples/phone_typing_probe.rs` and
// `shared_chat_probe.rs` pull this file in with `#[path]`, and a module reached
// that way resolves its children against the including file's directory.
#[path = "scaffold/plan.rs"]
mod plan;
#[path = "scaffold/report.rs"]
mod report;
#[path = "scaffold/runner.rs"]
mod runner;

pub use plan::{default_parent, validate};

const LINE_TAIL: usize = 200;
const KEPT_RUNS: usize = 8;
const BATCH_LINES: usize = 40;
const BATCH_WINDOW: Duration = Duration::from_millis(120);
/// The live stream drains this on its tick, so events wait here in between. A
/// package manager printing faster than the tick is bounded rather than left
/// to grow: the oldest lines go, and the phone's own log keeps the tail.
const OUTBOX_CAP: usize = 512;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Running,
    Done,
    Failed,
    Stalled,
    Cancelled,
}
impl Phase {
    fn name(self) -> &'static str {
        match self {
            Phase::Running => "running",
            Phase::Done => "done",
            Phase::Failed => "failed",
            Phase::Stalled => "stalled",
            Phase::Cancelled => "cancelled",
        }
    }
}

pub struct Run {
    dir: String,
    phase: Phase,
    progress: Option<Value>,
    lines: VecDeque<String>,
    error: Option<String>,
    project: Option<Value>,
    cancel: Arc<AtomicBool>,
}
impl Run {
    fn push_line(&mut self, line: String) {
        if self.lines.len() == LINE_TAIL {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
    }
    fn describe(&self, run_id: &str) -> Value {
        json!({"runId":run_id,"dir":self.dir,"phase":self.phase.name(),"progress":self.progress,
            "lines":self.lines,"error":self.error,"project":self.project})
    }
}

#[derive(Default)]
pub struct Scaffolds {
    runs: HashMap<String, Run>,
    order: VecDeque<String>,
    /// Folders a run was asked to build in. Only these may be opened as they
    /// stand, so a phone cannot name an arbitrary folder and have the window
    /// add it as a project.
    targets: HashSet<String>,
    outbox: VecDeque<Value>,
}
impl Scaffolds {
    fn emit(&mut self, event: &str, data: Value) {
        if self.outbox.len() >= OUTBOX_CAP {
            self.outbox.pop_front();
        }
        self.outbox.push_back(json!({"event":event,"data":data}));
    }
    /// Everything queued since the stream last looked.
    pub fn drain(&mut self) -> Vec<Value> {
        self.outbox.drain(..).collect()
    }
}
pub type SharedScaffolds = Arc<Mutex<Scaffolds>>;

fn text<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params[key]
        .as_str()
        .ok_or_else(|| format!("{key} is missing"))
}

fn run_id(params: &Value) -> Result<&str, String> {
    let id = text(params, "runId")?;
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("runId must be 1–64 letters, digits or dashes".into());
    }
    Ok(id)
}

/// The `scaffold.*` half of the desktop adapter.
pub struct Scaffolder {
    scaffolds: SharedScaffolds,
    workspace: SharedWorkspace,
    requests: Arc<TerminalRequests>,
}
