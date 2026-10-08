//! What the Agent V2 runner is doing, for the UI: a snapshot command plus an
//! `agent-v2:runner-status` event whenever it changes.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RunnerStatus {
    /// `starting`, `signed_out`, `no_selection`, `disabled`, `not_ready`,
    /// `idle`, `running`, `error`.
    pub state: String,
    pub provider: Option<String>,
    pub account: Option<String>,
    pub runtime_id: Option<String>,
    pub run_id: Option<String>,
    pub detail: Option<String>,
}

static STATUS: Mutex<Option<RunnerStatus>> = Mutex::new(None);

pub fn snapshot() -> RunnerStatus {
    STATUS
        .lock()
        .ok()
        .and_then(|status| status.clone())
        .unwrap_or_else(|| RunnerStatus {
            state: "starting".into(),
            ..Default::default()
        })
}

pub fn set(app: &AppHandle, status: RunnerStatus) {
    let changed = STATUS
        .lock()
        .map(|mut current| {
            let changed = current.as_ref() != Some(&status);
            *current = Some(status.clone());
            changed
        })
        .unwrap_or(false);
    if changed {
        let _ = app.emit("agent-v2:runner-status", status);
    }
}

pub fn simple(state: &str, detail: Option<&str>) -> RunnerStatus {
    RunnerStatus {
        state: state.into(),
        detail: detail.map(str::to_owned),
        ..Default::default()
    }
}
