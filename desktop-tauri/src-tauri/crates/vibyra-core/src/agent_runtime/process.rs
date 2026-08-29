//! Running one turn: spawn, stream, cancel, and leave nothing behind.
//!
//! This is the second execution path in Vibyra and it is deliberately not the
//! first. Code Mode's terminals are long-lived PTYs whose value *is* the
//! screen; a structured turn is a short-lived process whose value is its
//! stdout, read as JSON lines. Rendering a terminal and scraping it back into
//! a transcript would be the same work done twice and wrong once.
//!
//! Three things here are the difference between a tidy app and a machine full
//! of orphans:
//!
//! * **Process groups.** A provider CLI spawns shells, which spawn compilers.
//!   Killing the child leaves the grandchildren running and holding the
//!   pipe. The child is made a session leader at spawn so the whole tree can
//!   be signalled at once.
//! * **Bounded lines.** A single unterminated line of provider output must not
//!   grow until it is the process's memory. Anything past the cap is dropped
//!   with the line.
//! * **Cancellation is a state, not an exception.** Stopping a turn ends that
//!   turn; the chat, its transcript and its session id are untouched, and the
//!   next turn resumes exactly where the conversation was.

use std::io::{BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::error::{CoreError, CoreResult};

use super::process_io::{collect_stderr, read_bounded};
use super::process_kill::{detach, terminate_group};

/// What to run for one turn.
pub struct TurnCommand {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    /// Applied on top of the sanitized parent environment — the account's
    /// `CODEX_HOME`/`CLAUDE_CONFIG_DIR`, and nothing else.
    pub env: Vec<(String, String)>,
    /// Variables stripped before the child sees them. Every provider
    /// credential that is not this account's belongs here.
    pub env_remove: Vec<String>,
    /// Written to stdin and closed. Prompts never travel as arguments.
    pub prompt: String,
}

/// A turn in flight. Cloneable so the UI thread can cancel what a worker
/// thread is streaming.
#[derive(Clone)]
pub struct TurnHandle {
    cancelled: Arc<AtomicBool>,
    pid: Arc<parking_lot::Mutex<Option<u32>>>,
}

impl TurnHandle {
    pub fn new() -> Self {
        Self {
            cancelled: Arc::new(AtomicBool::new(false)),
            pid: Arc::new(parking_lot::Mutex::new(None)),
        }
    }

    /// Asks the turn to stop and signals its whole process group.
    ///
    /// Both halves matter: the flag stops the reader from emitting events for
    /// a turn the user has abandoned, and the signal stops the work. Setting
    /// the flag before signalling means a race can only end with a cancelled
    /// turn reporting cancelled, never with a killed process reporting a crash.
    pub fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        if let Some(pid) = *self.pid.lock() {
            terminate_group(pid);
        }
    }

    pub fn cancelled(&self) -> bool {
        self.cancelled.load(Ordering::SeqCst)
    }
}

impl Default for TurnHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// How a turn ended.
#[derive(Debug, Clone, PartialEq)]
pub enum TurnExit {
    Completed,
    Cancelled,
    Failed(String),
}

/// Runs `command` to completion, calling `on_line` for each line of stdout.
///
/// Blocking by design — the caller owns the thread. Returns how the turn
/// ended, never an error for a non-zero exit: a provider that fails is a
/// transcript event, not an exception the UI has to invent a message for.
pub fn run(
    command: TurnCommand,
    handle: &TurnHandle,
    mut on_line: impl FnMut(&str),
) -> CoreResult<TurnExit> {
    let mut child = spawn(&command)?;
    *handle.pid.lock() = child.id().into();
    if handle.cancelled() {
        // Cancelled between the handle being created and the process
        // existing; the pid is only now knowable, so signal it here.
        terminate_group(child.id());
    }

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(command.prompt.as_bytes());
        // Dropping closes it, which is what tells both CLIs the prompt is
        // complete. Without this they wait on stdin forever.
    }

    let stderr = child.stderr.take().map(collect_stderr);
    if let Some(stdout) = child.stdout.take() {
        let mut reader = BufReader::new(stdout);
        let mut line = Vec::new();
        loop {
            line.clear();
            match read_bounded(&mut reader, &mut line) {
                Ok(0) => break,
                Ok(_) => {
                    if handle.cancelled() {
                        break;
                    }
                    if let Ok(text) = std::str::from_utf8(&line) {
                        on_line(text.trim_end());
                    }
                }
                Err(_) => break,
            }
        }
    }

    let status = child.wait().map_err(CoreError::Io)?;
    if handle.cancelled() {
        return Ok(TurnExit::Cancelled);
    }
    if status.success() {
        return Ok(TurnExit::Completed);
    }
    let detail = stderr
        .and_then(|reader| reader.join().ok())
        .filter(|text| !text.is_empty())
        .unwrap_or_else(|| format!("{} exited with {status}", command.program));
    Ok(TurnExit::Failed(detail))
}

fn spawn(command: &TurnCommand) -> CoreResult<Child> {
    let mut process = Command::new(&command.program);
    process
        .args(&command.args)
        .current_dir(&command.cwd)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    crate::launch_env::sanitize_command(&mut process);
    for key in &command.env_remove {
        process.env_remove(key);
    }
    for (key, value) in &command.env {
        process.env(key, value);
    }
    detach(&mut process);
    process.spawn().map_err(|error| {
        CoreError::Pty(format!(
            "could not start {}: {error}. Is it installed and on PATH?",
            command.program
        ))
    })
}
