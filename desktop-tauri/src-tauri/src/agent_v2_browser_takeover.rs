//! Visible sign-in takeover: the model asks, automation pauses, the Mac app
//! shows "Your teammate needs you to sign in" with Show browser / Resume.
//! Only the person's Resume (a local Tauri command, never a model tool)
//! hands control back. Cancelling the run or the timeout also ends it.

use serde::Serialize;
use serde_json::json;
use std::collections::HashMap;
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Takeover {
    pub run_id: String,
    pub action_id: String,
    pub reason: String,
    pub url: String,
    pub active: bool,
    #[serde(skip)]
    resumed: bool,
    #[serde(skip)]
    show: bool,
}

static PENDING: Mutex<Option<HashMap<String, Takeover>>> = Mutex::new(None);
static CHANGED: Condvar = Condvar::new();

fn emit(app: Option<&AppHandle>, takeover: &Takeover) {
    if let Some(app) = app {
        let _ = app.emit("agent-browser-takeover", takeover);
    }
}

pub fn begin(app: Option<&AppHandle>, run_id: &str, action_id: &str, reason: &str, url: &str) {
    let takeover = Takeover {
        run_id: run_id.into(),
        action_id: action_id.into(),
        reason: reason.chars().take(300).collect(),
        url: url.into(),
        active: true,
        resumed: false,
        show: false,
    };
    PENDING
        .lock()
        .unwrap()
        .get_or_insert_with(HashMap::new)
        .insert(run_id.into(), takeover.clone());
    emit(app, &takeover);
}

/// Blocks until Resume (`Ok`), or the run's end / timeout (`Err`). `show` is
/// called whenever the person asks to see the browser again.
pub fn wait(run_id: &str, limit: Duration, mut show: impl FnMut()) -> Result<(), String> {
    let started = Instant::now();
    let mut guard = PENDING.lock().unwrap();
    loop {
        let Some(entry) = guard.as_mut().and_then(|m| m.get_mut(run_id)) else {
            return Err("The takeover ended.".into());
        };
        if entry.resumed {
            return Ok(());
        }
        if std::mem::take(&mut entry.show) {
            drop(guard);
            show();
            guard = PENDING.lock().unwrap();
            continue;
        }
        if started.elapsed() >= limit {
            return Err("Nobody resumed the browser in time.".into());
        }
        guard = CHANGED
            .wait_timeout(guard, Duration::from_millis(250))
            .unwrap()
            .0;
    }
}

/// Clears it (resumed, cancelled or timed out) and tells the app to hide the prompt.
pub fn end(app: Option<&AppHandle>, run_id: &str) {
    let removed = PENDING
        .lock()
        .unwrap()
        .as_mut()
        .and_then(|m| m.remove(run_id));
    CHANGED.notify_all();
    if let Some(mut takeover) = removed {
        takeover.active = false;
        emit(app, &takeover);
    }
}

fn update(run_id: &str, change: impl FnOnce(&mut Takeover)) -> bool {
    let mut guard = PENDING.lock().unwrap();
    let found = guard
        .as_mut()
        .and_then(|m| m.get_mut(run_id))
        .map(change)
        .is_some();
    CHANGED.notify_all();
    found
}

pub fn resume(run_id: &str) -> bool {
    update(run_id, |t| t.resumed = true)
}

pub fn list() -> Vec<Takeover> {
    PENDING
        .lock()
        .unwrap()
        .as_ref()
        .map(|m| m.values().cloned().collect())
        .unwrap_or_default()
}

#[tauri::command]
pub fn agent_browser_takeovers() -> Vec<Takeover> {
    list()
}

#[tauri::command]
pub fn agent_browser_show(run_id: String) -> Result<(), String> {
    update(&run_id, |t| t.show = true)
        .then_some(())
        .ok_or_else(|| "That sign-in request has ended.".into())
}

#[tauri::command]
pub fn agent_browser_resume(run_id: String) -> Result<serde_json::Value, String> {
    resume(&run_id)
        .then(|| json!({"ok": true}))
        .ok_or_else(|| "That sign-in request has ended.".into())
}
