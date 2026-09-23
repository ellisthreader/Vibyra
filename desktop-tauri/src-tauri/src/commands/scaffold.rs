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

#[tauri::command]
pub async fn scaffold_destination(path: String) -> Result<DestinationState, String> {
    run_blocking(move || Ok(destination_state(std::path::Path::new(&path)))).await
}

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

fn execute(
    plan: &ScaffoldPlan,
    on_event: &Channel<ScaffoldEvent>,
    cancel: &AtomicBool,
) -> ScaffoldResult {
    let steps = match prepare(plan) {
        Ok(steps) => steps,
        Err(error) => return failed(error.to_string()),
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

fn failed(message: String) -> ScaffoldResult {
    ScaffoldResult {
        ok: false,
        message: Some(message),
        stalled: false,
    }
}
