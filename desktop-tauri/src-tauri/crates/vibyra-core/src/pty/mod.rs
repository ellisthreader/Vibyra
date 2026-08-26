mod buffer;
mod chat_prompt;
mod conversation;
mod flusher;
mod manager;
// Only `conversation` reads rollout headers, and only Linux exposes the open
// files it reads them from. Kept available under `test` so the rule itself is
// still exercised on the platforms that cannot use it.
#[cfg(any(target_os = "linux", test))]
mod rollout_source;
mod session;
mod writer;

// Every test in here drives a real PTY through `/bin/sh`, so the whole module
// is Unix-only. Gating the tests individually left the helpers behind them
// unused on Windows, where `-D warnings` turned that into a failed release.
#[cfg(all(test, unix))]
mod flusher_latency_tests;
#[cfg(all(test, unix))]
mod flusher_tests;
#[cfg(all(test, unix))]
mod manager_tests;

pub use manager::{FlushConfig, OutputSink, PtyManager};

use serde::{Deserialize, Serialize};

pub type SessionId = u64;

/// How the frontend is currently presenting a terminal, which drives how
/// aggressively Rust flushes output for it.
///
/// - `Visible`: the pane with keyboard focus; flushed immediately when idle,
///   one tick (~16 ms) apart under sustained output, so its echo is instant.
/// - `Background`: on screen but not focused. Every delivery costs the
///   renderer a full xterm write plus a canvas repaint (~1.2 ms measured), so
///   a grid of panes all flushing at the tick multiplies straight into the
///   frame budget: eight of them saturate the WebKit main thread and the
///   focused pane's own echo is what starves. Paced instead, which is
///   imperceptible for streaming output and leaves the budget to whoever is
///   being typed into.
/// - `Hidden`: rendered but off-screen (other tab); flushed at a slow
///   interval so xterm.js stays warm without burning CPU.
/// - `Hibernated`: not rendered at all; nothing is sent, output is retained
///   in the scrollback ring and replayed on wake.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Visibility {
    Visible,
    Background,
    Hidden,
    Hibernated,
}

/// Everything needed to launch a process inside a PTY.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LaunchSpec {
    pub program: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Vec<(String, String)>,
    #[serde(default)]
    pub env_remove: Vec<String>,
    pub cwd: Option<String>,
    #[serde(default = "default_rows")]
    pub rows: u16,
    #[serde(default = "default_cols")]
    pub cols: u16,
}

fn default_rows() -> u16 {
    30
}

fn default_cols() -> u16 {
    100
}

impl LaunchSpec {
    pub fn shell(shell: Option<String>, cwd: Option<String>) -> Self {
        let program = shell.unwrap_or_else(default_shell);
        Self {
            program,
            args: Vec::new(),
            env: Vec::new(),
            env_remove: Vec::new(),
            cwd,
            rows: default_rows(),
            cols: default_cols(),
        }
    }

    /// Remote shell via the system `ssh` binary inside a PTY — the robust
    /// route for interactive SSH (keys, agent forwarding, ProxyJump and
    /// ~/.ssh/config all behave exactly like the user's terminal).
    pub fn ssh(target: &str, extra_args: &[String]) -> Self {
        let mut args = vec!["-tt".to_string()];
        args.extend(extra_args.iter().cloned());
        args.push(target.to_string());
        Self {
            program: "ssh".to_string(),
            args,
            env: Vec::new(),
            env_remove: Vec::new(),
            cwd: None,
            rows: default_rows(),
            cols: default_cols(),
        }
    }
}

pub fn default_shell() -> String {
    #[cfg(windows)]
    {
        "powershell.exe".to_string()
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

/// Descriptive snapshot of a session for the frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionInfo {
    pub id: SessionId,
    pub agent_id: String,
    pub title: String,
    pub program: String,
    pub cwd: Option<String>,
    pub visibility: Visibility,
    pub alive: bool,
    pub exit_code: Option<i32>,
    /// The safe-mode worktree this session runs in, for the Review tool.
    /// The manager reports `None`; the launch path fills it, because only the
    /// prepared launch knows the branch and base commit.
    pub workspace: Option<crate::workspace::SafeWorkspaceRef>,
}
