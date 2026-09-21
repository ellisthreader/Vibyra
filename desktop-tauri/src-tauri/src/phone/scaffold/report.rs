//! Running a plan on its own thread, and telling the phone how it is going.
//!
//! Split out of `scaffold.rs` for the 200-line standard. Nothing here runs
//! inside a request: a build holds a thread, and the connection's event pump
//! must stay free to drain what this queues.

use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    sync::{atomic::AtomicBool, Arc},
    time::Instant,
};
use vibyra_core::scaffold::{git_init, prepare, run_step, ScaffoldPlan, StepOutcome};

use super::runner::open_in_window;
use super::{Phase, SharedScaffolds, BATCH_LINES, BATCH_WINDOW};
// Relative rather than `crate::phone::…`: the examples pull this tree in with
// `#[path]`, so there is no `phone` module at their crate root.
use super::super::requests::TerminalRequests;

struct Reporter {
    scaffolds: SharedScaffolds,
    run_id: String,
    pending: Mutex<(Vec<String>, Instant)>,
}
impl Reporter {
    fn step(&self, index: usize, total: usize, label: &str) {
        self.flush();
        let progress = json!({"index":index,"total":total,"label":label});
        let mut scaffolds = self.scaffolds.lock();
        if let Some(run) = scaffolds.runs.get_mut(&self.run_id) {
            run.progress = Some(progress);
        }
        scaffolds.emit(
            "scaffold.step",
            json!({"runId":self.run_id,"index":index,"total":total,"label":label}),
        );
    }
    fn line(&self, line: String) {
        if let Some(run) = self.scaffolds.lock().runs.get_mut(&self.run_id) {
            run.push_line(line.clone());
        }
        let mut pending = self.pending.lock();
        pending.0.push(line);
        let due = pending.0.len() >= BATCH_LINES || pending.1.elapsed() >= BATCH_WINDOW;
        if !due {
            return;
        }
        let lines = std::mem::take(&mut pending.0);
        pending.1 = Instant::now();
        drop(pending);
        self.scaffolds.lock().emit(
            "scaffold.output",
            json!({"runId":self.run_id,"lines":lines}),
        );
    }
    fn flush(&self) {
        let lines = {
            let mut pending = self.pending.lock();
            pending.1 = Instant::now();
            std::mem::take(&mut pending.0)
        };
        if !lines.is_empty() {
            self.scaffolds.lock().emit(
                "scaffold.output",
                json!({"runId":self.run_id,"lines":lines}),
            );
        }
    }
    fn finish(&self, phase: Phase, error: Option<String>, project: Option<Value>) {
        self.flush();
        let mut scaffolds = self.scaffolds.lock();
        if let Some(run) = scaffolds.runs.get_mut(&self.run_id) {
            run.phase = phase;
            run.progress = None;
            run.error = error.clone();
            run.project = project.clone();
        }
        // The folder list changes first, so a phone that refreshes on it already
        // holds the new project when the outcome arrives.
        if phase == Phase::Done {
            scaffolds.emit("host.changed", json!({}));
        }
        scaffolds.emit(
            "scaffold.done",
            json!({"runId":self.run_id,"ok":phase == Phase::Done,
            "message":error,"stalled":phase == Phase::Stalled,"project":project}),
        );
    }
}

pub(super) fn execute(
    scaffolds: SharedScaffolds,
    requests: Arc<TerminalRequests>,
    run_id: String,
    plan: ScaffoldPlan,
    cancel: Arc<AtomicBool>,
) {
    let reporter = Reporter {
        scaffolds,
        run_id,
        pending: Mutex::new((Vec::new(), Instant::now())),
    };
    let steps = match prepare(&plan) {
        Ok(steps) => steps,
        Err(error) => return reporter.finish(Phase::Failed, Some(error.to_string()), None),
    };
    let total = steps.len();
    for (index, step) in steps.iter().enumerate() {
        reporter.step(index, total, &step.label);
        let emit = |line: String| reporter.line(line);
        match run_step(step, &emit, &cancel) {
            Ok(StepOutcome::Finished(0)) => {}
            Ok(StepOutcome::Finished(code)) => {
                return reporter.finish(
                    Phase::Failed,
                    Some(format!("{} stopped with exit code {code}.", step.label)),
                    None,
                );
            }
            Ok(StepOutcome::Stalled) => {
                return reporter.finish(
                    Phase::Stalled,
                    Some(format!("{} is waiting for an answer.", step.label)),
                    None,
                );
            }
            Ok(StepOutcome::Cancelled) => {
                return reporter.finish(Phase::Cancelled, Some("Cancelled.".into()), None)
            }
            Err(error) => return reporter.finish(Phase::Failed, Some(error.to_string()), None),
        }
    }
    if plan.git_init && !git_init(&plan.dir) {
        reporter.line("git init did not run — the project is fine without it.".into());
    }
    // Built. The window is asked to open it, and only then is it a project the
    // phone can enter; a window that is closed leaves the folder on disk and
    // says so, which is what the wizard's "open it as it stands" is for.
    match open_in_window(&requests, &plan.dir) {
        Ok(project) => reporter.finish(Phase::Done, None, Some(project)),
        Err(error) => reporter.finish(
            Phase::Failed,
            Some(format!(
                "The project was built but is not open yet: {error}"
            )),
            None,
        ),
    }
}
