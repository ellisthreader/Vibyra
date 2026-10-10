//! The background loop: signed in → account selected → Agent V2 enabled for
//! this user → binding registered → three bounded isolated task slots.

use super::api::RunnerApi;
use crate::state::AppState;
use std::path::PathBuf;
use std::time::Instant;
use tauri::{AppHandle, Manager};

#[path = "runner_job.rs"]
mod job;
#[path = "runner_setup.rs"]
mod setup;
#[path = "runner_tick.rs"]
mod tick;

#[derive(Default)]
struct Cache {
    /// `(token, enabled, checked at)`: the flag check is cheap but not free.
    enabled: Option<(String, bool, Instant)>,
    identity: Option<String>,
    pool: super::pool::Pool,
    /// Parked on `provider_signin`: re-register once the account signs back in.
    signin: super::signin_watch::Parked,
}

pub fn spawn(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        // Run folders live in a private app folder; a crash can leave one (with its
        // broker credentials) behind, here or in the temp directory of older builds.
        if let Some(dir) = settings_dir(&app) {
            super::workspace::use_private_base(dir.join("agent-runs"));
        }
        let _ = tauri::async_runtime::spawn_blocking(super::workspace_sweep::sweep_stale).await;
        let mut cache = Cache::default();
        loop {
            let wait = tick::tick(&app, &mut cache).await;
            tokio::time::sleep(wait).await;
        }
    });
}

fn settings_dir(app: &AppHandle) -> Option<PathBuf> {
    app.state::<AppState>()
        .settings_path
        .parent()
        .map(PathBuf::from)
}
