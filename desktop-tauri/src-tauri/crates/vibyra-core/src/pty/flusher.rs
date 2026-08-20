use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Arc;

use parking_lot::RwLock;

use super::buffer::Drained;
use super::manager::{FlushConfig, OutputSink};
use super::session::Session;
use super::{SessionId, Visibility};

pub fn spawn(
    sessions: Arc<RwLock<HashMap<SessionId, Arc<Session>>>>,
    sink: Arc<dyn OutputSink>,
    shutdown: Arc<AtomicBool>,
    config: FlushConfig,
    wake_rx: Receiver<()>,
) {
    std::thread::Builder::new()
        .name("vibyra-pty-flusher".to_string())
        .spawn(move || {
            // Reused across ticks: a fresh Vec per tick is allocator churn.
            let mut due = Vec::new();
            // Loops until the wake channel disconnects; a timeout is just a
            // quiet tick and drives the hidden-session flush interval.
            while let Ok(()) | Err(RecvTimeoutError::Timeout) =
                wake_rx.recv_timeout(config.hidden_interval)
            {
                if shutdown.load(Ordering::SeqCst) {
                    break;
                }
                // Flush immediately on wake so an isolated keystroke echoes
                // with no added latency, then rest one tick after a delivery
                // so sustained output coalesces instead of flushing per read.
                if flush_due(&sessions, sink.as_ref(), &config, &mut due) {
                    std::thread::sleep(config.tick);
                }
            }
        })
        .expect("failed to spawn pty flusher thread");
}

/// Returns true when anything was delivered, so the caller can pace itself.
fn flush_due(
    sessions: &RwLock<HashMap<SessionId, Arc<Session>>>,
    sink: &dyn OutputSink,
    config: &FlushConfig,
    snapshot: &mut Vec<Arc<Session>>,
) -> bool {
    snapshot.clear();
    snapshot.extend(sessions.read().values().cloned());
    let mut delivered = false;
    for session in snapshot.drain(..) {
        let drained = {
            let mut output = session.output.lock();
            let due = match output.visibility {
                Visibility::Visible => output.has_pending(),
                Visibility::Hidden => {
                    output.has_pending() && output.last_flush.elapsed() >= config.hidden_interval
                }
                Visibility::Hibernated => false,
            };
            due.then(|| output.drain())
        };
        match drained {
            Some(Drained::Chunk(text)) => {
                delivered = true;
                sink.on_output(session.id, text);
            }
            Some(Drained::Resync(snapshot)) => {
                delivered = true;
                sink.on_resync(session.id, snapshot);
            }
            Some(Drained::Nothing) | None => {}
        }
    }
    delivered
}
