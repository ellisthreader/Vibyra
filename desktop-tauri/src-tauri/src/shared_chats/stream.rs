//! One subscription to every project's engine, as a single stream.
//!
//! Each engine hands out its own channel, and std channels cannot be waited
//! on together, so this used to poll them all — and lock `slots` — 20 times a
//! second for as long as the app ran, once more per phone subscription. Now a
//! thread per engine blocks on its channel and forwards into one inbox, and
//! the subscriber sleeps on that inbox until an event arrives, a project is
//! added, or the pulse is due.

use super::SharedChats;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};

const PULSE: Duration = Duration::from_secs(2);
/// How often a forwarder with nothing to forward checks that its subscriber
/// is still there. An idle project's engine may never send again, and a
/// forwarder that only noticed on its next send outlived every phone that
/// ever subscribed.
const IDLE_CHECK: Duration = if cfg!(test) {
    Duration::from_millis(20)
} else {
    Duration::from_secs(5)
};

/// Clears its flag when a subscriber's thread ends, however it ends.
struct Subscribed(Arc<AtomicBool>);

impl Drop for Subscribed {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

enum Feed {
    Event(Value),
    /// The engine dropped this reader for lagging.
    Lost(String),
    /// A project was added; only a wake-up, `Wake::version` says what changed.
    Slots,
}

/// How a new project reaches subscribers that are asleep on their inboxes.
#[derive(Default)]
pub(super) struct Wake {
    version: AtomicU64,
    inboxes: Mutex<Vec<mpsc::SyncSender<Feed>>>,
}

impl Wake {
    pub(super) fn slots_changed(&self) {
        self.version.fetch_add(1, Ordering::SeqCst);
        // Never blocks: a full inbox is being drained right now, and its
        // subscriber reads `version` after every message it takes.
        self.inboxes.lock().retain(|inbox| {
            !matches!(
                inbox.try_send(Feed::Slots),
                Err(mpsc::TrySendError::Disconnected(_))
            )
        });
    }
}

fn forward(
    id: String,
    reader: mpsc::Receiver<Value>,
    inbox: mpsc::SyncSender<Feed>,
    alive: Arc<AtomicBool>,
) {
    std::thread::spawn(move || loop {
        match reader.recv_timeout(IDLE_CHECK) {
            Ok(event) => {
                if inbox.send(Feed::Event(event)).is_err() {
                    return;
                }
            }
            Err(mpsc::RecvTimeoutError::Timeout) if alive.load(Ordering::SeqCst) => {}
            Err(mpsc::RecvTimeoutError::Timeout) => return,
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                let _ = inbox.send(Feed::Lost(id));
                return;
            }
        }
    });
}

impl SharedChats {
    pub fn subscribe(self: &Arc<Self>) -> mpsc::Receiver<Value> {
        let (tx, rx) = mpsc::sync_channel(256);
        // Bounded like the engine's own channel, so a stalled consumer still
        // backs up into the engine and gets its lagging reader dropped.
        let (feed, inbox) = mpsc::sync_channel::<Feed>(256);
        self.wake.inboxes.lock().push(feed.clone());
        let weak = Arc::downgrade(self);
        let alive = Arc::new(AtomicBool::new(true));
        std::thread::spawn(move || {
            let _subscribed = Subscribed(alive.clone());
            let mut attached = HashSet::new();
            let mut seen = None;
            let mut pulse = Instant::now();
            loop {
                let Some(chats) = weak.upgrade() else {
                    return;
                };
                let version = chats.wake.version.load(Ordering::SeqCst);
                if seen != Some(version) {
                    seen = Some(version);
                    for slot in chats.slots.lock().iter() {
                        if attached.insert(slot.project.id.clone()) {
                            forward(
                                slot.project.id.clone(),
                                slot.engine.subscribe(),
                                feed.clone(),
                                alive.clone(),
                            );
                            if tx.send(json!({"event":"host.changed","data":{}})).is_err() {
                                return;
                            }
                        }
                    }
                }
                drop(chats);
                match inbox.recv_timeout(PULSE.saturating_sub(pulse.elapsed())) {
                    Ok(Feed::Event(event)) => {
                        if tx.send(event).is_err() {
                            return;
                        }
                    }
                    // Engine deliberately drops lagging subscribers. Reattach
                    // and explicitly reload snapshots; never leave a silent
                    // stale chat.
                    Ok(Feed::Lost(id)) => {
                        if tx.send(json!({"event":"host.changed","data":{}})).is_err() {
                            return;
                        }
                        attached.remove(&id);
                        seen = None;
                        if tx
                            .send(json!({"event":"conversation.resync","data":{}}))
                            .is_err()
                        {
                            return;
                        }
                    }
                    Ok(Feed::Slots) | Err(_) => {}
                }
                if pulse.elapsed() >= PULSE {
                    if tx.send(json!({"event":"shared.pulse","data":{}})).is_err() {
                        return;
                    }
                    pulse = Instant::now();
                }
            }
        });
        rx
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_idle_forwarder_ends_once_its_subscriber_is_gone() {
        let (_engine, reader) = mpsc::sync_channel::<Value>(1);
        let (feed, inbox) = mpsc::sync_channel::<Feed>(1);
        let alive = Arc::new(AtomicBool::new(true));
        forward("project".into(), reader, feed, alive.clone());
        let quiet = inbox.recv_timeout(IDLE_CHECK * 5);
        assert!(
            matches!(quiet, Err(mpsc::RecvTimeoutError::Timeout)),
            "it waits while wanted"
        );
        drop(Subscribed(alive));
        // Its sender is the last one, so the inbox disconnects when it ends.
        let ended = inbox.recv_timeout(Duration::from_secs(5));
        assert!(matches!(ended, Err(mpsc::RecvTimeoutError::Disconnected)));
    }
}
