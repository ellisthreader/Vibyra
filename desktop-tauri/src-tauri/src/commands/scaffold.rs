use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::State;
use vibyra_core::scaffold::{git_init, installed_tools, prepare, ScaffoldPlan, StepOutcome};

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
    /// Why it stopped, in the words the dialog shows. `None` on success.
    pub message: Option<String>,
    /// True when a step went silent: the dialog offers a real terminal.
    pub stalled: bool,
}

#[tauri::command]
pub async fn scaffold_preflight(tools: Vec<String>) -> Result<HashMap<String, bool>, String> {
    run_blocking(move || Ok(installed_tools(&tools))).await
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
