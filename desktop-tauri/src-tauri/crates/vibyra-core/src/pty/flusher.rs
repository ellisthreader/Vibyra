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
            let mut pass = Pass::default();
            // Loops until the wake channel disconnects. A timeout is just a
            // quiet tick that drives the hidden-session flush interval, so it
            // is only armed while a hidden session holds undelivered output;
            // otherwise the thread sleeps until a read or a visibility change
            // wakes it. Every manager owns one of these, most with no
            // sessions at all, and each used to wake four times a second.
            loop {
                let woke = if pass.hidden_pending {
                    !matches!(
                        wake_rx.recv_timeout(config.hidden_interval),
                        Err(RecvTimeoutError::Disconnected)
                    )
                } else {
                    wake_rx.recv().is_ok()
                };
                if !woke || shutdown.load(Ordering::SeqCst) {
                    break;
                }
                // Flush immediately on wake so an isolated keystroke echoes
                // with no added latency, then rest one tick after a delivery
                // so sustained output coalesces instead of flushing per read.
                pass = flush_due(&sessions, sink.as_ref(), &config, &mut due);
                if pass.delivered {
                    std::thread::sleep(config.tick);
                }
            }
        })
        .expect("failed to spawn pty flusher thread");
}

/// What one flush pass saw, so the caller can pace itself and knows whether
/// the hidden interval still has anything to time.
#[derive(Default)]
struct Pass {
    delivered: bool,
    hidden_pending: bool,
}

fn flush_due(
    sessions: &RwLock<HashMap<SessionId, Arc<Session>>>,
    sink: &dyn OutputSink,
    config: &FlushConfig,
    snapshot: &mut Vec<Arc<Session>>,
) -> Pass {
    snapshot.clear();
    snapshot.extend(sessions.read().values().cloned());
    let mut pass = Pass::default();
    for session in snapshot.drain(..) {
        let drained = {
            let mut output = session.output.lock();
            let drained = output.due(config.hidden_interval).then(|| output.drain());
            // A held pane's output is timed like a hidden one's: its hold can
            // lapse with nothing else left to wake this thread.
            pass.hidden_pending |= (output.visibility == Visibility::Hidden || output.is_held())
                && output.has_pending();
            drained
        };
        match drained {
            Some(Drained::Chunk(text)) => {
                pass.delivered = true;
                sink.on_output(session.id, text);
            }
            Some(Drained::Resync(snapshot)) => {
                pass.delivered = true;
                sink.on_resync(session.id, snapshot);
            }
            Some(Drained::Nothing) | None => {}
        }
    }
    pass
}
