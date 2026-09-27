//! Starting a project from the window's own wizard.
//!
//! The phone reaches the same engine through `phone::scaffold`, which answers
//! the Host's `scaffold.*` methods. This is the shorter path: the renderer
//! already lives in this process, so a plan arrives as a command argument and
//! progress goes back down a channel rather than over a socket.
//!
//! A build blocks — it spawns package managers and waits on them — so it runs
//! through `run_blocking` and reports its cancel flag into `AppState` for
//! `scaffold_cancel` to find.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use vibyra_core::scaffold::{
    destination_state, free_name, git_init, installed_tools, prepare, DestinationState,
    ScaffoldPlan, StepOutcome,
};

use super::run_blocking;
use crate::state::AppState;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum ScaffoldEvent {
    Step {
        index: usize,
        total: usize,
        label: String,
    },
    Line {
        data: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldResult {
    pub ok: bool,
    /// Why it stopped, in the words the wizard shows. `None` on success.
    pub message: Option<String>,
    /// True when a step went silent: the wizard offers a real terminal.
    pub stalled: bool,
}

/// Which of the catalog's toolchains are on PATH. Asked once when the wizard
/// opens, so a stack that cannot be built is disabled before it is picked
/// rather than failing halfway through.
#[tauri::command]
pub async fn scaffold_preflight(tools: Vec<String>) -> Result<HashMap<String, bool>, String> {
    run_blocking(move || Ok(installed_tools(&tools))).await
}

/// Whether a project can be built at this path, asked as the name is typed so
/// that a folder someone else's work is in is refused on the screen that can do
/// something about it, not on the build screen that cannot.
#[tauri::command]
pub async fn scaffold_destination(path: String) -> Result<DestinationState, String> {
    run_blocking(move || Ok(destination_state(std::path::Path::new(&path)))).await
}

/// A name whose folder is actually free, for the wizard to open with. The
/// suggestion is made here rather than in the renderer because only this side
/// can see the disk.
#[tauri::command]
pub async fn scaffold_free_name(parent: String, base: String) -> Result<String, String> {
    run_blocking(move || Ok(free_name(std::path::Path::new(&parent), &base))).await
}

#[tauri::command]
pub async fn scaffold_run(
    state: State<'_, AppState>,
    run_id: String,
    plan: ScaffoldPlan,
    on_event: Channel<ScaffoldEvent>,
) -> Result<ScaffoldResult, String> {
    let cancel = Arc::new(AtomicBool::new(false));
    let runs = Arc::clone(&state.scaffold_runs);
    runs.lock().insert(run_id.clone(), Arc::clone(&cancel));
    let result = run_blocking(move || Ok(execute(&plan, &on_event, &cancel))).await;
    runs.lock().remove(&run_id);
    result
}

#[tauri::command]
pub async fn scaffold_cancel(state: State<'_, AppState>, run_id: String) -> Result<(), String> {
    let cancel = state.scaffold_runs.lock().get(&run_id).cloned();
    if let Some(cancel) = cancel {
        cancel.store(true, Ordering::Relaxed);
    }
    Ok(())
}

/// Cancels every scaffold and GitHub publish when the app quits, and gives
/// them a moment to take their process groups down. The stopping happens on
/// each build's own thread; without the wait, `exit` would end the process
/// first and whatever the package manager started would outlive the app.
pub fn cancel_all(runs: &Mutex<HashMap<String, Arc<AtomicBool>>>, grace: Duration) {
    for cancel in runs.lock().values() {
        cancel.store(true, Ordering::Relaxed);
    }
    let deadline = Instant::now() + grace;
    while !runs.lock().is_empty() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
}

fn execute(
    plan: &ScaffoldPlan,
    on_event: &Channel<ScaffoldEvent>,
    cancel: &AtomicBool,
) -> ScaffoldResult {
    let steps = match prepare(plan) {
        Ok(steps) => steps,
        // A person reads this: "invalid path: …" is how the error type talks
        // about itself, and says nothing they can act on.
        Err(error) => return failed(sentence(error.to_string())),
    };
    let total = steps.len();
    for (index, step) in steps.iter().enumerate() {
        let _ = on_event.send(ScaffoldEvent::Step {
            index,
            total,
            label: step.label.clone(),
        });
        let emit = |data: String| {
            let _ = on_event.send(ScaffoldEvent::Line { data });
        };
        match vibyra_core::scaffold::run_step(step, &emit, cancel) {
            Ok(StepOutcome::Finished(0)) => {}
            Ok(StepOutcome::Finished(code)) => {
                return failed(format!("{} stopped with exit code {code}.", step.label));
            }
            Ok(StepOutcome::Stalled) => {
                return ScaffoldResult {
                    ok: false,
                    message: Some(format!("{} is waiting for an answer.", step.label)),
                    stalled: true,
                };
            }
            Ok(StepOutcome::Cancelled) => return failed("Cancelled.".into()),
            Err(error) => return failed(error.to_string()),
        }
    }
    // A repository is a convenience, never the point: a template that made one
    // already, or a machine without git, must not fail a finished project.
    if plan.git_init && !git_init(&plan.dir) {
        let _ = on_event.send(ScaffoldEvent::Line {
            data: "git init did not run — the project is fine without it.".into(),
        });
    }
    ScaffoldResult {
        ok: true,
        message: None,
        stalled: false,
    }
}

/// Drops a `CoreError`'s variant prefix, leaving the sentence after it.
fn sentence(message: String) -> String {
    match message.split_once(": ") {
        Some((head, rest)) if head.ends_with("error") || head.ends_with("path") => rest.to_string(),
        _ => message,
    }
}

fn failed(message: String) -> ScaffoldResult {
    ScaffoldResult {
        ok: false,
        message: Some(message),
        stalled: false,
    }
}
