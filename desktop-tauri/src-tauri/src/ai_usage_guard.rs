use std::path::PathBuf;
use std::sync::Arc;
use std::time::Instant;

use parking_lot::Mutex;

use vibyra_core::fsx::write_private_atomic;

use crate::ai_usage::{period_keys, AiCall, AiLimits, UsageLedger};
use crate::ai_usage_limits::{admit, budget, prune, MINUTE};

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
}

#[derive(Debug)]
pub(crate) struct GuardInner {
    pub(crate) ledger: UsageLedger,
    /// Admission times for the last hour — backs the rolling rate limits.
    pub(crate) recent: Vec<Instant>,
    pub(crate) chat_in_flight: bool,
    pub(crate) voice_in_flight: bool,
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
            }),
        }
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
            }
            inner.recent.push(Instant::now());
            inner.ledger.count_call(kind);
            inner.ledger.clone()
        };
        self.persist(&snapshot);
        Ok(CallPermit {
            guard: Arc::clone(self),
            kind,
        })
    }

    fn settle(&self, mutate: impl FnOnce(&mut UsageLedger)) {
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

    fn release(&self, kind: AiCall) {
        let mut inner = self.inner.lock();
        match kind {
            AiCall::Chat => inner.chat_in_flight = false,
            AiCall::Voice => inner.voice_in_flight = false,
        }
    }
}

/// Held for the lifetime of one billed request. Dropping it frees the in-flight
/// slot whether the request succeeded, failed, or unwound.
#[derive(Debug)]
pub struct CallPermit {
    guard: Arc<AiUsageGuard>,
    kind: AiCall,
}

impl CallPermit {
    pub fn finish_chat(self, input_tokens: u64, output_tokens: u64) {
        self.guard
            .settle(|ledger| ledger.add_chat_cost(input_tokens, output_tokens));
    }

    pub fn finish_voice(self, seconds: f64) {
        self.guard.settle(|ledger| ledger.add_voice_cost(seconds));
    }
}

impl Drop for CallPermit {
    fn drop(&mut self) {
        self.guard.release(self.kind);
    }
}
