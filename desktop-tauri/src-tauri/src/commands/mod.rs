pub mod account;
pub mod agent_approvals_cmd;
pub mod agent_chat;
pub mod agent_chat_files;
pub mod agent_chat_prompt;
pub mod agent_config;
pub mod agent_conversations;
#[cfg(test)]
mod agent_conversations_tests;
pub mod agent_mail_cmd;
pub mod agent_roster;
pub mod agent_routines_cmd;
pub mod agent_skills_cmd;
pub mod agents;
pub mod ai;
pub mod ai_service;
pub mod boot;
pub mod claude_transcripts;
pub mod clipboard;
pub mod codex_transcripts;
pub mod conversation_carry;
pub mod fs;
pub mod github;
pub mod memory;
pub mod perf;
pub mod preview;
pub mod probe;
pub mod project_activity;
pub mod provider_accounts;
pub mod registry;
pub mod render;
pub mod report;
pub mod review;
pub mod scaffold;
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
pub mod screenshot_reveal;
#[cfg(test)]
mod screenshot_tests;
#[cfg(target_os = "linux")]
mod screenshot_x11;
pub mod session;
pub mod settings;
pub mod speech;
pub mod terminal;
mod terminal_args;
mod terminal_launch;
#[cfg(test)]
mod terminal_launch_tests;
mod terminal_prepare;
pub mod voice;
mod voice_level;
#[cfg(test)]
mod voice_level_tests;
pub mod workspaces;

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
