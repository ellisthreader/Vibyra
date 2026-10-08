//! Sends the menu bar's names-only snapshot to the account service, which keeps the iPhone's
//! computer card current by push while the phone is locked (`api/live-status/v1/mac`).
//!
//! Only what the menu bar already shows travels: pane and chat titles, project names, counts.
//! Never prompt text or terminal output. Sent on every change and every five minutes while
//! signed in (the server ends the card after a quiet spell and marks it stale if the Mac stops).
//! Failures are silent: the menu bar never depends on the network.
use parking_lot::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::menu_bar_model::StatusSnapshot;
use crate::state::AppState;

const HEARTBEAT: Duration = Duration::from_secs(5 * 60);
const PATH: &str = "/api/live-status/v1/mac";

static LATEST: Mutex<Option<StatusSnapshot>> = Mutex::new(None);
static HEARTBEAT_STARTED: AtomicBool = AtomicBool::new(false);

/// Called by the menu bar after it applied a changed snapshot.
pub fn report(app: &AppHandle, snap: &StatusSnapshot) {
    *LATEST.lock() = Some(snap.clone());
    send_latest(app.clone());
    if !HEARTBEAT_STARTED.swap(true, Ordering::SeqCst) {
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(HEARTBEAT).await;
                send_latest(app.clone());
            }
        });
    }
}

fn send_latest(app: AppHandle) {
    let Some(snap) = LATEST.lock().clone() else {
        return;
    };
    // Switched off in Settings: nothing leaves the Mac.
    if !snap.enabled {
        return;
    }
    let Some(token) = app.state::<AppState>().account.token() else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let body = serde_json::json!({
            "name": computer_name(),
            "attention": snap.attention,
            "working": snap.working,
            "recent": snap.recent,
        });
        let url = format!("{}{PATH}", crate::account_api::base_url());
        let _ = crate::http_client::shared()
            .post(url)
            .bearer_auth(token)
            .header("Accept", "application/json")
            .timeout(Duration::from_secs(15))
            .json(&body)
            .send()
            .await;
    });
}

fn computer_name() -> String {
    crate::account_device::hostname()
        .map(|name| name.trim_end_matches(".local").to_owned())
        .filter(|name| !name.is_empty())
        .unwrap_or_else(|| "Your Mac".into())
}
