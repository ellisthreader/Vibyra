use std::io::Write;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::Arc;

use crate::error::{CoreError, CoreResult};

use super::SessionId;

const MAX_PENDING_INPUT_BYTES: usize = 4 * 1024 * 1024;
const MAX_PENDING_INPUT_MESSAGES: usize = 1024;

struct QueuedInput {
    bytes: Vec<u8>,
    pending: Arc<AtomicUsize>,
    messages: Arc<AtomicUsize>,
}

impl Drop for QueuedInput {
    fn drop(&mut self) {
        self.pending.fetch_sub(self.bytes.len(), Ordering::AcqRel);
        self.messages.fetch_sub(1, Ordering::AcqRel);
    }
}

fn input_full() -> CoreError {
    CoreError::Pty("Terminal input buffer is full. This input was not sent; wait for the terminal to catch up and try again.".into())
}

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
    tx: Sender<QueuedInput>,
    pending: Arc<AtomicUsize>,
    messages: Arc<AtomicUsize>,
}

impl SessionWriter {
    pub fn spawn(id: SessionId, mut pty: Box<dyn Write + Send>) -> CoreResult<Self> {
        // Admission below bounds this channel before allocation/enqueueing.
        // Retain the original nonblocking handoff used by the typing path.
        let (tx, rx) = mpsc::channel::<QueuedInput>();
        let pending = Arc::new(AtomicUsize::new(0));
        let messages = Arc::new(AtomicUsize::new(0));
        std::thread::Builder::new()
            .name(format!("vibyra-ptyw-{id}"))
            .spawn(move || {
                // Ends when the session is dropped and takes the sender with
                // it. A write failure means the PTY is gone; the reader thread
                // owns reporting that, so this just stops.
                while let Ok(input) = rx.recv() {
                    if pty
                        .write_all(&input.bytes)
                        .and_then(|()| pty.flush())
                        .is_err()
                    {
                        break;
                    }
                }
            })
            .map_err(CoreError::Io)?;
        Ok(Self {
            tx,
            pending,
            messages,
        })
    }

    /// Queues `data` behind everything already queued. Never blocks, so this
    /// is safe to call from the IPC thread on every keystroke.
    pub fn queue(&self, id: SessionId, data: &[u8]) -> CoreResult<()> {
        if data.is_empty() {
            return Ok(());
        }
        self.pending
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |current| {
                current
                    .checked_add(data.len())
                    .filter(|size| *size <= MAX_PENDING_INPUT_BYTES)
            })
            .map_err(|_| input_full())?;
        if self
            .messages
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                // Includes the message currently being written to the PTY.
                (count <= MAX_PENDING_INPUT_MESSAGES).then_some(count + 1)
            })
            .is_err()
        {
            self.pending.fetch_sub(data.len(), Ordering::AcqRel);
            return Err(input_full());
        }
        // The reservation includes the write in progress, and drops on every
        // failure/receiver shutdown path. send never waits for the PTY reader.
        let input = QueuedInput {
            bytes: data.to_vec(),
            pending: Arc::clone(&self.pending),
            messages: Arc::clone(&self.messages),
        };
        self.tx
            .send(input)
            .map_err(|_| CoreError::SessionExited(id))
    }
}

// Drives a real PTY, so Unix-only for the same reason as `manager_tests`.
#[cfg(all(test, unix))]
#[path = "writer_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "writer_bounds_tests.rs"]
mod bounds_tests;
