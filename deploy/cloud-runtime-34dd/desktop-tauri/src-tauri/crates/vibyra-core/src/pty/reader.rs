use std::io::Read;
use std::sync::atomic::Ordering;
use std::sync::mpsc::SyncSender;
use std::sync::Arc;
use std::time::Duration;

use crate::error::{CoreError, CoreResult};

use super::session::Session;
use super::SessionId;

/// Starts the thread that moves PTY output into the session's buffer and,
/// once the terminal closes, reports how the process exited. Delivery to the
/// UI belongs to the flusher; this only wakes it for output worth delivering.
pub(super) fn spawn(
    session: Arc<Session>,
    mut reader: Box<dyn Read + Send>,
    flush_tx: SyncSender<()>,
    on_exit: impl FnOnce(SessionId, Option<i32>) + Send + 'static,
) -> CoreResult<()> {
    std::thread::Builder::new()
        .name(format!("vibyra-pty-{}", session.id))
        .spawn(move || {
            let mut buf = [0u8; 16 * 1024];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) | Err(_) => break,
                    Ok(n) => {
                        if session.output.lock().push(&buf[..n]) {
                            let _ = flush_tx.try_send(());
                        }
                    }
                }
            }
            // EOF on the PTY usually means the child is gone, but a
            // process can close its terminal and keep running. Poll with
            // try_wait so the child lock is never held while blocking —
            // holding it in wait() would deadlock kill().
            let code = loop {
                match session.child.lock().try_wait() {
                    Ok(Some(status)) => break Some(status.exit_code() as i32),
                    Ok(None) => {}
                    Err(_) => break None,
                }
                std::thread::sleep(Duration::from_millis(50));
            };
            *session.exit_code.lock() = code;
            session.alive.store(false, Ordering::SeqCst);
            on_exit(session.id, code);
        })
        .map(drop)
        .map_err(CoreError::Io)
}
