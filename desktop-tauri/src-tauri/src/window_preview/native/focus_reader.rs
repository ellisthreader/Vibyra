//! One application reader; refresh and post-input observation have bounded slots.
use super::{measure, scan, Backend, Geometry, Seen};
use parking_lot::Mutex;
use serde_json::Value;
use std::sync::{
    mpsc::{channel, sync_channel, Sender, SyncSender},
    Arc,
};
use std::time::Instant;

struct Observation {
    window: Geometry,
    reply: Sender<Value>,
    deadline: Instant,
}

#[derive(Default)]
struct Pending {
    refresh: Option<Geometry>,
    observation: Option<Observation>,
}

#[derive(Clone)]
pub(super) struct Reader {
    pending: Arc<Mutex<Pending>>,
    wake: SyncSender<()>,
}

impl Reader {
    pub fn start(backend: &'static dyn Backend, seen: Arc<Mutex<Seen>>) -> Option<Self> {
        let pending = Arc::new(Mutex::new(Pending::default()));
        let work = Arc::clone(&pending);
        let (wake, receive) = sync_channel(1);
        std::thread::Builder::new()
            .name("vibyra-window-focus".into())
            .spawn(move || {
                // No other thread calls application focus APIs or overwrites focus.
                while receive.recv().is_ok() {
                    loop {
                        let next = {
                            let mut work = work.lock();
                            work.observation
                                .take()
                                .map(Ok)
                                .or_else(|| work.refresh.take().map(Err))
                        };
                        match next {
                            Some(Ok(observation)) => {
                                if Instant::now() >= observation.deadline {
                                    continue;
                                }
                                let state = measure(&seen, backend, &observation.window);
                                // Reply before any slow field-map scan.
                                let _ = observation.reply.send(state);
                            }
                            Some(Err(window)) => {
                                measure(&seen, backend, &window);
                                let scan_due = work.lock().observation.is_none();
                                if scan_due {
                                    scan(&seen, backend, &window);
                                }
                            }
                            None => break,
                        }
                    }
                }
            })
            .ok()?;
        Some(Self { pending, wake })
    }

    pub fn refresh(&self, window: &Geometry) {
        self.pending.lock().refresh = Some(window.clone());
        let _ = self.wake.try_send(());
    }

    pub fn observe(&self, window: &Geometry, deadline: Instant) -> Option<Value> {
        let (reply, receive) = channel();
        // Replacing a queued observation closes its own reply channel. A caller
        // can never mistake another request's reply for its post-input reading.
        self.pending.lock().observation = Some(Observation {
            window: window.clone(),
            reply,
            deadline,
        });
        let _ = self.wake.try_send(());
        receive
            .recv_timeout(deadline.saturating_duration_since(Instant::now()))
            .ok()
    }
}
