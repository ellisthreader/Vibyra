//! One test run per project at a time: started by a click, output streamed
//! into a bounded buffer, cancelled with the whole process group, and always
//! ended by the stall guard (silent 90 s) or the wall clock (10 minutes).

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use parking_lot::Mutex;
use serde::Serialize;

use super::test_detect::{detect, TestCommand};
use super::test_summary::{counts, Counts};
use crate::scaffold::{run_step_with, ScaffoldStep, StepOutcome};

pub const MAX_LINES: usize = 1000;
const WALL_CLOCK: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TestStatus {
    Idle,
    Running,
    Passed,
    Failed,
    Cancelled,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestState {
    pub status: TestStatus,
    /// The detected command, or `None` when the project has no test script.
    pub command: Option<String>,
    pub lines: Vec<String>,
    /// Older lines were dropped to stay within the buffer.
    pub truncated: bool,
    pub counts: Counts,
    pub exit_code: Option<i32>,
    pub started_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    pub message: Option<String>,
}

impl TestState {
    fn idle(command: Option<String>) -> Self {
        Self {
            status: TestStatus::Idle,
            command,
            lines: Vec::new(),
            truncated: false,
            counts: Counts::default(),
            exit_code: None,
            started_ms: None,
            duration_ms: None,
            message: None,
        }
    }
}

struct Run {
    state: TestState,
    cancel: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct TestRuns {
    runs: Mutex<HashMap<String, Arc<Mutex<Run>>>>,
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

/// Terminal colour sequences are not text.
fn plain(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\u{1b}' {
            out.push(c);
        } else if chars.next_if_eq(&'[').is_some() {
            for code in chars.by_ref() {
                if ('@'..='~').contains(&code) {
                    break;
                }
            }
        }
    }
    out
}

impl TestRuns {
    pub fn state(&self, key: &str, root: &Path) -> TestState {
        match self.runs.lock().get(key) {
            Some(run) => run.lock().state.clone(),
            None => TestState::idle(detect(root).map(|c| c.label)),
        }
    }

    pub fn cancel(&self, key: &str, root: &Path) -> TestState {
        if let Some(run) = self.runs.lock().get(key) {
            run.lock().cancel.store(true, Ordering::Relaxed);
        }
        self.state(key, root)
    }

    /// Begins the project's test command. Refused while one is still running
    /// and when no test script exists. Returns the new state and its cancel flag.
    pub fn start(&self, key: &str, root: &Path) -> Result<(TestState, Arc<AtomicBool>), String> {
        if let Some(run) = self.runs.lock().get(key) {
            if run.lock().state.status == TestStatus::Running {
                return Err("Tests are already running for this project.".into());
            }
        }
        let command = detect(root).ok_or("This project has no test script to run.")?;
        let cancel = Arc::new(AtomicBool::new(false));
        let mut state = TestState::idle(Some(command.label.clone()));
        state.status = TestStatus::Running;
        state.started_ms = Some(now_ms());
        let run = Arc::new(Mutex::new(Run {
            state: state.clone(),
            cancel: Arc::clone(&cancel),
        }));
        self.runs.lock().insert(key.to_owned(), Arc::clone(&run));
        let flag = Arc::clone(&cancel);
        std::thread::spawn(move || execute(command, run, flag));
        Ok((state, cancel))
    }
}

fn execute(command: TestCommand, run: Arc<Mutex<Run>>, cancel: Arc<AtomicBool>) {
    let step = ScaffoldStep {
        label: command.label.clone(),
        program: command.program.clone(),
        args: command.args.clone(),
        cwd: command.cwd.to_string_lossy().into_owned(),
    };
    let began = Instant::now();
    let timed_out = AtomicBool::new(false);
    let keep = |line: String| {
        if began.elapsed() > WALL_CLOCK {
            timed_out.store(true, Ordering::Relaxed);
            cancel.store(true, Ordering::Relaxed);
        }
        let mut run = run.lock();
        let state = &mut run.state;
        state.lines.push(plain(&line));
        if state.lines.len() > MAX_LINES {
            state.lines.remove(0);
            state.truncated = true;
        }
    };
    let outcome = run_step_with(&step, &keep, &cancel, &|c| {
        c.env("CI", "1")
            .env("NO_COLOR", "1")
            .env("FORCE_COLOR", "0");
    });
    let mut run = run.lock();
    let state = &mut run.state;
    state.duration_ms = Some(began.elapsed().as_millis() as u64);
    state.counts = counts(&state.lines.join("\n"));
    match outcome {
        Ok(StepOutcome::Finished(code)) => {
            state.exit_code = Some(code);
            state.status = if code == 0 {
                TestStatus::Passed
            } else {
                TestStatus::Failed
            };
        }
        Ok(StepOutcome::Cancelled) if timed_out.load(Ordering::Relaxed) => {
            state.status = TestStatus::Error;
            state.message = Some("Stopped after 10 minutes.".into());
        }
        Ok(StepOutcome::Cancelled) => state.status = TestStatus::Cancelled,
        Ok(StepOutcome::Stalled) => {
            state.status = TestStatus::Error;
            state.message = Some("The tests went quiet for 90 seconds, so they were stopped. Run them in a terminal if they ask a question.".into());
        }
        Err(error) => {
            state.status = TestStatus::Error;
            state.message = Some(error.to_string());
        }
    }
}

#[cfg(test)]
#[path = "test_run_tests.rs"]
mod tests;
