pub mod account;
pub mod agents;
pub mod ai;
pub mod ai_memory;
pub mod ai_service;
pub mod fs;
pub mod memory;
pub mod memory_browser;
pub mod preview;
pub mod provider_accounts;
pub mod render;
pub mod screenshot;
#[cfg(target_os = "linux")]
mod screenshot_capture;
#[cfg(target_os = "windows")]
#[path = "screenshot_capture_windows.rs"]
mod screenshot_capture;
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
#[path = "screenshot_capture_unsupported.rs"]
mod screenshot_capture;
mod screenshot_png;
#[cfg(test)]
mod screenshot_tests;
#[cfg(target_os = "linux")]
mod screenshot_x11;
pub mod session;
pub mod settings;
pub mod terminal;
mod terminal_launch;
#[cfg(test)]
mod terminal_launch_tests;
mod terminal_prepare;
pub mod voice;

use vibyra_core::{CoreError, CoreResult};

// Tauri runs `async fn` commands on the async runtime, so any command that
// blocks — filesystem walks, `git`, provider CLIs — must hand that work to a
// blocking thread instead of stalling a runtime worker. Commands declared
// `fn` are worse still: they run inline on the IPC thread and freeze the UI.
// Every command that touches disk, spawns a process, or waits on one routes
// through one of these two helpers.

pub(crate) async fn run_blocking<T: Send + 'static>(
    task: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| error.to_string())?
}

pub(crate) async fn run_blocking_core<T: Send + 'static>(
    task: impl FnOnce() -> CoreResult<T> + Send + 'static,
) -> CoreResult<T> {
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| CoreError::Task(error.to_string()))?
}
