use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use crate::ai_usage::AiCall;
use crate::ai_usage_guard::AiUsageGuard;

/// Held for the lifetime of one billed request. Dropping it frees the in-flight
/// slot whether the request succeeded, failed, or unwound.
#[derive(Debug)]
pub struct CallPermit {
    guard: Arc<AiUsageGuard>,
    kind: AiCall,
}

impl CallPermit {
    pub(crate) fn new(guard: Arc<AiUsageGuard>, kind: AiCall) -> Self {
        Self { guard, kind }
    }

    /// Arms the guard's one cancel slot for this request. The id travels with
    /// the flag because a Stop that lands after a Retry has already started
    /// must find the retry's id in the slot and leave it alone.
    pub fn cancel_flag(&self, request_id: &str) -> Arc<AtomicBool> {
        self.guard.arm_cancel(request_id)
    }

    pub fn finish_chat(self, input_tokens: u64, output_tokens: u64) {
        self.guard
            .settle(|ledger| ledger.add_chat_cost(input_tokens, output_tokens));
    }

    pub fn finish_voice(self, seconds: f64) {
        self.guard.settle(|ledger| ledger.add_voice_cost(seconds));
    }

    pub fn finish_speech(self, characters: u64) {
        self.guard
            .settle(|ledger| ledger.add_speech_cost(characters));
    }
}

impl Drop for CallPermit {
    fn drop(&mut self) {
        self.guard.release(self.kind);
    }
}
