//! Sign-in attempts: one spawned provider CLI per provider, watched until it
//! succeeds, fails, times out or is cancelled. stdin stays open throughout so a
//! sign-in that ends on "paste the code" can still be answered.
use super::attempt::{Attempt, AttemptView, Limits, Phase, STOP_GRACE};
use super::output::ProcessOutput;
use parking_lot::Mutex;
use std::{
    collections::{HashMap, HashSet},
    io::Write,
    process::Child,
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc,
    },
    time::Instant,
};
use vibyra_core::process_group;

#[derive(Default)]
struct Inner {
    live: HashMap<String, Attempt>,
    cancelled: HashSet<String>,
}

pub(super) struct Attempts {
    inner: Mutex<Inner>,
    serial: AtomicU64,
    limits: Limits,
}

impl Attempts {
    pub fn new(limits: Limits) -> Self {
        Self {
            inner: Mutex::default(),
            serial: AtomicU64::new(0),
            limits,
        }
    }

    /// Replaces any attempt for `id` and watches the new one, so a timeout or
    /// a failure is noticed even when nobody is asking for status.
    pub fn start(self: &Arc<Self>, id: &str, mut child: Child, output: Arc<Mutex<ProcessOutput>>) {
        let serial = self.serial.fetch_add(1, Ordering::SeqCst);
        let stdin = child.stdin.take();
        let old = {
            let mut inner = self.inner.lock();
            inner.cancelled.remove(id);
            let attempt = Attempt {
                child,
                stdin,
                output,
                started: Instant::now(),
                finished_at: None,
                phase: Phase::Running,
                serial,
            };
            inner.live.insert(id.to_owned(), attempt)
        };
        if let Some(old) = old {
            old.stop();
        }
        let (store, id) = (Arc::downgrade(self), id.to_owned());
        let _ = std::thread::Builder::new()
            .name("vibyra-ai-login".into())
            .spawn(move || loop {
                let Some(store) = store.upgrade() else { return };
                std::thread::sleep(store.limits.tick);
                let mut inner = store.inner.lock();
                match inner.live.get_mut(&id) {
                    Some(attempt) if attempt.serial == serial => {
                        attempt.observe(Instant::now(), &store.limits);
                        if matches!(attempt.phase, Phase::Failed | Phase::TimedOut) {
                            return;
                        }
                    }
                    _ => return,
                }
            });
    }

    pub fn view(&self, id: &str) -> AttemptView {
        let mut inner = self.inner.lock();
        let Some(attempt) = inner.live.get_mut(id) else {
            let phase = if inner.cancelled.contains(id) {
                Phase::Cancelled
            } else {
                Phase::None
            };
            return AttemptView {
                phase,
                sign_in_page_available: false,
                device_code: String::new(),
                prompt: String::new(),
                failure_line: String::new(),
            };
        };
        attempt.observe(Instant::now(), &self.limits);
        let output = attempt.output.lock();
        AttemptView {
            phase: attempt.phase,
            sign_in_page_available: !output.url().is_empty(),
            device_code: output.device_code(),
            prompt: output.prompt(),
            failure_line: output.failure_line(),
        }
    }

    pub fn sign_in_url(&self, id: &str) -> Option<String> {
        let inner = self.inner.lock();
        let url = inner.live.get(id)?.output.lock().url();
        (!url.is_empty()).then_some(url)
    }

    /// Types `line` at the CLI: the only way a paste-the-code login finishes.
    pub fn submit(&self, id: &str, line: &str) -> Result<(), String> {
        let mut inner = self.inner.lock();
        let attempt = inner
            .live
            .get_mut(id)
            .ok_or("Start the sign-in first.".to_string())?;
        let stdin = attempt
            .stdin
            .as_mut()
            .ok_or("This sign-in is not accepting input.".to_string())?;
        writeln!(stdin, "{line}")
            .and_then(|()| stdin.flush())
            .map_err(|error| format!("Could not send that to the provider: {error}"))?;
        attempt.output.lock().mark_answered();
        Ok(())
    }

    /// Stops the attempt's whole process tree and remembers it was cancelled.
    pub fn cancel(&self, id: &str) {
        let attempt = {
            let mut inner = self.inner.lock();
            let attempt = inner.live.remove(id);
            if attempt.is_some() {
                inner.cancelled.insert(id.to_owned());
            }
            attempt
        };
        if let Some(attempt) = attempt {
            attempt.stop();
        }
    }

    /// The account connected: the attempt is over, without a "cancelled" note.
    pub fn finish(&self, id: &str) {
        let attempt = self.inner.lock().live.remove(id);
        self.inner.lock().cancelled.remove(id);
        if let Some(attempt) = attempt {
            attempt.stop();
        }
    }
}

impl Drop for Attempts {
    fn drop(&mut self) {
        let mut attempts: Vec<Attempt> =
            self.inner.get_mut().live.drain().map(|(_, a)| a).collect();
        for attempt in &mut attempts {
            drop(attempt.stdin.take());
        }
        process_group::stop_all(attempts.iter_mut().map(|a| &mut a.child), STOP_GRACE);
    }
}
