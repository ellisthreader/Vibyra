//! The build itself, on its own thread. Output is batched into a few events a
//! second rather than one per line: a package manager prints hundreds of lines
//! in a burst, and the connection drops a subscriber it cannot keep up with.

use crate::{
    scaffold::{Phase, SharedScaffolds},
    state::Shared,
};
use serde_json::{json, Value};
use std::{
    path::Path,
    sync::{atomic::AtomicBool, Arc, Mutex},
    time::{Duration, Instant},
};
use vibyra_core::scaffold::{git_init, prepare, run_step, ScaffoldPlan, StepOutcome};

const BATCH_LINES: usize = 40;
const BATCH_WINDOW: Duration = Duration::from_millis(120);

struct Reporter {
    shared: Shared,
    scaffolds: SharedScaffolds,
    run_id: String,
    pending: Mutex<(Vec<String>, Instant)>,
}
impl Reporter {
    fn emit(&self, event: &str, data: Value) {
        self.shared.lock().emit(event, data);
    }
    fn step(&self, index: usize, total: usize, label: &str) {
        self.flush();
        let progress = json!({"index":index,"total":total,"label":label});
        if let Some(run) = self.scaffolds.lock().runs.get_mut(&self.run_id) {
            run.progress = Some(progress.clone());
        }
        self.emit(
            "scaffold.step",
            json!({"runId":self.run_id,"index":index,"total":total,"label":label}),
        );
    }
    fn line(&self, line: String) {
        if let Some(run) = self.scaffolds.lock().runs.get_mut(&self.run_id) {
            run.push_line(line.clone());
        }
        let mut pending = self.pending.lock().expect("reporter");
        pending.0.push(line);
        let due = pending.0.len() >= BATCH_LINES || pending.1.elapsed() >= BATCH_WINDOW;
        if !due {
            return;
        }
        let lines = std::mem::take(&mut pending.0);
        pending.1 = Instant::now();
        drop(pending);
        self.emit(
            "scaffold.output",
            json!({"runId":self.run_id,"lines":lines}),
        );
    }
    fn flush(&self) {
        let lines = {
            let mut pending = self.pending.lock().expect("reporter");
            pending.1 = Instant::now();
            std::mem::take(&mut pending.0)
        };
        if !lines.is_empty() {
            self.emit(
                "scaffold.output",
                json!({"runId":self.run_id,"lines":lines}),
            );
        }
    }
    fn finish(&self, phase: Phase, error: Option<String>, project: Option<Value>) {
        self.flush();
        if let Some(run) = self.scaffolds.lock().runs.get_mut(&self.run_id) {
            run.phase = phase;
            run.progress = None;
            run.error = error.clone();
            run.project = project.clone();
        }
        // The project list changes first, so a phone that refreshes on it already
        // holds the new folder when the outcome arrives.
        if phase == Phase::Done {
            self.emit("host.changed", json!({}));
        }
        self.emit(
            "scaffold.done",
            json!({"runId":self.run_id,"ok":phase == Phase::Done,
            "message":error,"stalled":phase == Phase::Stalled,"project":project}),
        );
    }
}

pub(crate) fn execute(
    shared: Shared,
    scaffolds: SharedScaffolds,
    run_id: String,
    plan: ScaffoldPlan,
    cancel: Arc<AtomicBool>,
) {
    let reporter = Reporter {
        shared: shared.clone(),
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
    // The folder exists now, so it is a project this computer shares from here on.
    let adopted = shared.lock().adopt_project(Path::new(&plan.dir));
    match adopted {
        Ok(project) => reporter.finish(Phase::Done, None, Some(project)),
        Err(error) => reporter.finish(
            Phase::Failed,
            Some(format!(
                "The project was built but could not be shared: {error}"
            )),
            None,
        ),
    }
}
