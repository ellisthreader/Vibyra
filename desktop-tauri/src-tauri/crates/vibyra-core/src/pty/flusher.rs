use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, RecvTimeoutError};
use std::sync::Arc;
use std::time::{Duration, Instant};

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
            // The shared clock the paced tiers align to; see `flush_due`.
            let origin = Instant::now();
            // Reused across ticks: a fresh Vec per tick is allocator churn.
            let mut due = Vec::new();
            // How long to wait before the next scan is worth doing. Recomputed
            // from the sessions that hold undelivered bytes, so an idle app
            // blocks on the wake channel instead of polling.
            let mut wait = config.hidden_interval;
            // Loops until the wake channel disconnects; a timeout is just a
            // quiet tick that lets a paced session come due.
            while let Ok(()) | Err(RecvTimeoutError::Timeout) = wake_rx.recv_timeout(wait) {
                if shutdown.load(Ordering::SeqCst) {
                    break;
                }
                wait = flush_due(&sessions, sink.as_ref(), &config, origin, &mut due)
                    .unwrap_or(config.hidden_interval);
            }
        })
        .expect("failed to spawn pty flusher thread");
}

/// Who the renderer hears from first when one scan finds several sessions due.
///
/// Deliveries are worked through in the order they were sent, and each one
/// costs a full xterm write plus a repaint. Sent last, the echo of the key
/// just pressed is parsed too late to make the frame that burst ends in and
/// paints on the following one instead — which is what being a character
/// behind looks like. `HashMap` iteration order is arbitrary, so without this
/// the focused pane draws that slot at random.
fn delivery_priority(visibility: Visibility) -> u8 {
    match visibility {
        Visibility::Visible => 0,
        Visibility::Background => 1,
        Visibility::Hidden => 2,
        Visibility::Hibernated => 3,
    }
}

/// Which pacing period of `interval` an instant falls in, on the shared clock.
fn epoch(origin: Instant, at: Instant, interval: Duration) -> u128 {
    at.saturating_duration_since(origin).as_nanos() / interval.as_nanos().max(1)
}

/// Delivers every session that is due and returns how long until the soonest
/// undelivered one comes due, or `None` when nothing is waiting anywhere.
///
/// Two rules, both learned by measuring the renderer end to end:
///
/// - **The visible pane is paced only by its own last delivery.** An earlier
///   version slept one tick globally after any delivery, which made every
///   pane share a single delivery slot: a background agent streaming tokens
///   took the slot and the focused pane's echo waited out the sleep behind
///   it — a keystroke arriving a frame late for a reason that had nothing to
///   do with the pane being typed into. Unshared, its echo is deterministic:
///   ~1 ms to the webview, every keystroke, regardless of the other panes.
/// - **The paced tiers are aligned to shared epoch boundaries**, not each
///   session to its own last delivery. Sessions paced independently drift
///   apart until their deliveries spread evenly across time, and the
///   renderer then pays one full composite per message — measured at +14 CPU
///   points for identical bytes. Aligned, every background pane due in a
///   period lands in the same scan and the burst settles together. A session
///   quiet for longer than its interval sits in an older epoch, so waking
///   panes still deliver the instant they have something.
fn flush_due(
    sessions: &RwLock<HashMap<SessionId, Arc<Session>>>,
    sink: &dyn OutputSink,
    config: &FlushConfig,
    origin: Instant,
    snapshot: &mut Vec<Arc<Session>>,
) -> Option<Duration> {
    snapshot.clear();
    snapshot.extend(sessions.read().values().cloned());
    snapshot.sort_by_cached_key(|session| delivery_priority(session.output.lock().visibility));
    let now = Instant::now();
    let mut soonest: Option<Duration> = None;
    let mut nearer = |candidate: Duration| {
        soonest = Some(soonest.map_or(candidate, |best: Duration| best.min(candidate)));
    };
    for session in snapshot.drain(..) {
        let drained = {
            let mut output = session.output.lock();
            if !output.has_pending() {
                continue;
            }
            match output.visibility {
                Visibility::Hibernated => continue,
                Visibility::Visible => match config.tick.checked_sub(output.last_flush.elapsed()) {
                    Some(remaining) if !remaining.is_zero() => {
                        nearer(remaining);
                        None
                    }
                    _ => Some(output.drain()),
                },
                paced => {
                    let interval = if paced == Visibility::Background {
                        config.background_interval
                    } else {
                        config.hidden_interval
                    };
                    if epoch(origin, now, interval) > epoch(origin, output.last_flush, interval) {
                        Some(output.drain())
                    } else {
                        let into = now.saturating_duration_since(origin).as_nanos()
                            % interval.as_nanos().max(1);
                        nearer(interval.saturating_sub(Duration::from_nanos(into as u64)));
                        None
                    }
                }
            }
        };
        match drained {
            Some(Drained::Chunk(text)) => sink.on_output(session.id, text),
            Some(Drained::Resync(snapshot)) => sink.on_resync(session.id, snapshot),
            Some(Drained::Nothing) | None => {}
        }
    }
    soonest
}

#[cfg(test)]
mod tests {
    use super::{delivery_priority, epoch, Visibility};
    use std::time::{Duration, Instant};

    #[test]
    fn the_focused_pane_is_handed_to_the_renderer_first() {
        // Ordering only shows up as latency, never as wrong output, so it has
        // no natural assertion at the integration level — and timing one is
        // measuring drift, not order. The rule itself is the thing to pin.
        let mut tiers = [
            Visibility::Hibernated,
            Visibility::Hidden,
            Visibility::Background,
            Visibility::Visible,
        ];
        tiers.sort_by_key(|visibility| delivery_priority(*visibility));
        assert_eq!(
            tiers,
            [
                Visibility::Visible,
                Visibility::Background,
                Visibility::Hidden,
                Visibility::Hibernated,
            ],
            "the pane holding the keyboard must be delivered before any paced one",
        );
    }

    #[test]
    fn paced_sessions_share_epoch_boundaries_instead_of_drifting() {
        let origin = Instant::now();
        let interval = Duration::from_millis(75);
        // Two sessions that last delivered at different moments inside the
        // same period still both become due when the next boundary passes:
        // the epoch is a property of the shared clock, not of the session.
        let a = origin + Duration::from_millis(10);
        let b = origin + Duration::from_millis(60);
        let later = origin + Duration::from_millis(80);
        assert_eq!(epoch(origin, a, interval), epoch(origin, b, interval));
        assert!(epoch(origin, later, interval) > epoch(origin, a, interval));
        assert!(epoch(origin, later, interval) > epoch(origin, b, interval));
    }
}
