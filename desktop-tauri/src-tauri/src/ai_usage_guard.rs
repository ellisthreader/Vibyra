use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;

use parking_lot::Mutex;

use vibyra_core::fsx::write_private_atomic;

use crate::ai_usage::{period_keys, AiCall, AiLimits, UsageLedger};
use crate::ai_usage_limits::{admit, budget, prune, MINUTE};
use crate::ai_usage_permit::CallPermit;

// Every OpenAI-billed request in this app funnels through this guard. Two
// classes of protection live here and they answer different threats:
//
//   * Structural limits (the consts below) are not user-editable. They stop a
//     stuck key repeat, a render loop, or a retry storm from firing hundreds of
//     paid calls in seconds — the failure mode that produces a surprise bill
//     before anyone can react.
//   * Budget caps (AiLimits, from settings) are the user's own ceiling on daily
//     and monthly spend. They are checked against a pre-flight worst-case
//     estimate, so a call that would cross the cap is refused before it costs
//     anything.

#[derive(Debug)]
pub struct AiUsageGuard {
    path: PathBuf,
    inner: Mutex<GuardInner>,
    /// The one chat that can be stopped, and its request id. One slot is
    /// enough because "one chat in flight" is already this guard's invariant;
    /// the id is what keeps a late Stop off the retry that replaced it.
    cancel: Mutex<Option<(String, Arc<AtomicBool>)>>,
}

#[derive(Debug)]
pub(crate) struct GuardInner {
    pub(crate) ledger: UsageLedger,
    /// Admission times for the last hour — backs the rolling rate limits.
    pub(crate) recent: Vec<Instant>,
    pub(crate) chat_in_flight: bool,
    pub(crate) voice_in_flight: bool,
    /// Its own slot rather than the microphone's: reading a reply aloud and
    /// dictating the next one are different halves of the same conversation,
    /// and one must not report the other as busy.
    pub(crate) speech_in_flight: bool,
}

impl AiUsageGuard {
    pub fn new(path: PathBuf) -> Self {
        let ledger = std::fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<UsageLedger>(&raw).ok())
            .unwrap_or_default();
        Self {
            path,
            inner: Mutex::new(GuardInner {
                ledger,
                recent: Vec::new(),
                chat_in_flight: false,
                voice_in_flight: false,
                speech_in_flight: false,
            }),
            cancel: Mutex::new(None),
        }
    }

    /// Arms the cancel slot for this request, replacing whatever was there: a
    /// leftover entry can only belong to a call that has already finished.
    pub(crate) fn arm_cancel(&self, request_id: &str) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        *self.cancel.lock() = Some((request_id.to_string(), Arc::clone(&flag)));
        flag
    }

    /// Stops the reply with this id. False when the slot holds someone else's
    /// request, or nothing at all — both mean the reply already ended.
    pub fn cancel_chat(&self, request_id: &str) -> bool {
        let slot = self.cancel.lock();
        let Some((_, flag)) = slot.as_ref().filter(|(id, _)| id == request_id) else {
            return false;
        };
        flag.store(true, Ordering::Relaxed);
        true
    }

    pub fn ledger(&self) -> UsageLedger {
        let (day, month) = period_keys();
        let mut inner = self.inner.lock();
        inner.ledger.roll_to(&day, &month);
        inner.ledger.clone()
    }

    /// Calls admitted in the last minute and the last hour, for the settings pane.
    pub fn recent_counts(&self) -> (u32, u32) {
        let mut inner = self.inner.lock();
        prune(&mut inner.recent);
        let now = Instant::now();
        let minute = inner
            .recent
            .iter()
            .filter(|at| now.duration_since(**at) < MINUTE)
            .count();
        (minute as u32, inner.recent.len() as u32)
    }

    /// Reports whether the budget caps currently leave room, without reserving
    /// anything. Used before a recording starts, so a user is told the budget
    /// is gone up front rather than after speaking into a refused request. The
    /// rate limits are deliberately not applied here — a recording takes
    /// seconds, by which time they no longer bind.
    pub fn budget_available(&self, limits: AiLimits) -> Result<(), String> {
        let (day, month) = period_keys();
        let mut inner = self.inner.lock();
        inner.ledger.roll_to(&day, &month);
        prune(&mut inner.recent);
        budget(&inner.ledger, &inner.recent, limits, 0.0)
    }

    /// Refuses the call outright, or admits it and hands back a permit. The
    /// call is counted the moment it is admitted; `estimate_usd` is the
    /// worst-case price used for the pre-flight budget check.
    pub fn reserve(
        self: &Arc<Self>,
        kind: AiCall,
        limits: AiLimits,
        estimate_usd: f64,
    ) -> Result<CallPermit, String> {
        let (day, month) = period_keys();
        let snapshot = {
            let mut inner = self.inner.lock();
            inner.ledger.roll_to(&day, &month);
            admit(&mut inner, kind, limits, estimate_usd)?;
            match kind {
                AiCall::Chat => inner.chat_in_flight = true,
                AiCall::Voice => inner.voice_in_flight = true,
                AiCall::Speech => inner.speech_in_flight = true,
            }
            inner.recent.push(Instant::now());
            inner.ledger.count_call(kind);
            inner.ledger.clone()
        };
        self.persist(&snapshot);
        Ok(CallPermit::new(Arc::clone(self), kind))
    }

    pub(crate) fn settle(&self, mutate: impl FnOnce(&mut UsageLedger)) {
        let (day, month) = period_keys();
        let snapshot = {
            let mut inner = self.inner.lock();
            inner.ledger.roll_to(&day, &month);
            mutate(&mut inner.ledger);
            inner.ledger.clone()
        };
        self.persist(&snapshot);
    }

    /// Written through on every change: a crash mid-session must not hand the
    /// user a fresh budget on restart.
    fn persist(&self, ledger: &UsageLedger) {
        let Ok(raw) = serde_json::to_vec_pretty(ledger) else {
            return;
        };
        if let Some(parent) = self.path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = write_private_atomic(&self.path, &raw);
    }

    pub(crate) fn release(&self, kind: AiCall) {
        let mut inner = self.inner.lock();
        match kind {
            AiCall::Chat => inner.chat_in_flight = false,
            AiCall::Voice => inner.voice_in_flight = false,
            AiCall::Speech => inner.speech_in_flight = false,
        }
        drop(inner);
        // The flag dies with the call it belonged to, so a Stop that arrives
        // a moment too late finds an empty slot rather than a stale id.
        if matches!(kind, AiCall::Chat) {
            self.cancel.lock().take();
        }
    }
}
