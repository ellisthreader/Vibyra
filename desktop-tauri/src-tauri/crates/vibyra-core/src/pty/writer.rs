use std::io::Write;
use std::sync::mpsc::{channel, Sender};

use crate::error::{CoreError, CoreResult};

use super::SessionId;

/// Owns the write end of one PTY on a thread of its own.
///
/// Terminal input must reach the PTY in exactly the order the webview posted
/// it. WebKit delivers IPC messages to Tauri in order, and a *synchronous*
/// `#[tauri::command]` runs inline on that thread, so ordering is structural —
/// but only for a synchronous command. An `async fn` command is handed to
/// `tokio::spawn`, and two spawned tasks can be polled in either order, which
/// is what reverses two keystrokes.
///
/// Staying synchronous means the command must never block: a child that stops
/// reading its stdin fills the kernel PTY buffer, and a `write_all` there
/// would stall the thread that dispatches every other IPC message. So the
/// command only hands the bytes over, and this thread performs the write.
pub struct SessionWriter {
    /// Only ever sent to from the IPC thread, so this never contends.
    tx: Sender<Vec<u8>>,
}

impl SessionWriter {
    pub fn spawn(id: SessionId, mut pty: Box<dyn Write + Send>) -> CoreResult<Self> {
        let (tx, rx) = channel::<Vec<u8>>();
        std::thread::Builder::new()
            .name(format!("vibyra-ptyw-{id}"))
            .spawn(move || {
                // Ends when the session is dropped and takes the sender with
                // it. A write failure means the PTY is gone; the reader thread
                // owns reporting that, so this just stops.
                while let Ok(bytes) = rx.recv() {
                    if pty.write_all(&bytes).and_then(|()| pty.flush()).is_err() {
                        break;
                    }
                }
            })
            .map_err(CoreError::Io)?;
        Ok(Self { tx })
    }

    /// Queues `data` behind everything already queued. Never blocks, so this
    /// is safe to call from the IPC thread on every keystroke.
    pub fn queue(&self, id: SessionId, data: &[u8]) -> CoreResult<()> {
        self.tx
            .send(data.to_vec())
            .map_err(|_| CoreError::SessionExited(id))
    }
}

// Drives a real PTY, so Unix-only for the same reason as `manager_tests`.
#[cfg(all(test, unix))]
#[path = "writer_tests.rs"]
mod tests;
