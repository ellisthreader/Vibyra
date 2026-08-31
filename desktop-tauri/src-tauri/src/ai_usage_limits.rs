use std::time::{Duration, Instant};

use crate::ai_usage::{capped, AiCall, AiLimits, UsageLedger};
use crate::ai_usage_guard::GuardInner;

// Structural limits. Unlike the budget caps in settings these are not
// user-editable: they exist to stop a stuck key repeat, a render loop, or a
// retry storm from firing hundreds of paid calls in seconds — the failure mode
// that produces a surprise bill before anyone can react.
//
// Both numbers have to leave room for one legitimate pipeline: a spoken turn
// in Ask bills three calls — transcribe, chat, speak — each fired only when
// the previous one *returned*. A chain like that cannot run away on its own,
// so the limits are set to stop unattended repetition rather than to cap a
// conversation. A stuck key repeats at ~30 Hz and a render loop far faster;
// both are still refused by an interval this long.
const MIN_CALL_INTERVAL: Duration = Duration::from_millis(400);
const MAX_CALLS_PER_MINUTE: usize = 20;
pub(crate) const MINUTE: Duration = Duration::from_secs(60);
const HOUR: Duration = Duration::from_secs(3_600);

/// The whole admission decision for one request: structural rate limits
/// first, then the user's own budget caps.
pub(crate) fn admit(
    inner: &mut GuardInner,
    kind: AiCall,
    limits: AiLimits,
    estimate_usd: f64,
) -> Result<(), String> {
    let busy = match kind {
        AiCall::Chat => inner.chat_in_flight,
        AiCall::Voice => inner.voice_in_flight,
        AiCall::Speech => inner.speech_in_flight,
    };
    if busy {
        return Err("A request is already running — wait for it to finish.".into());
    }
    prune(&mut inner.recent);
    let now = Instant::now();
    if inner
        .recent
        .last()
        .is_some_and(|last| now.duration_since(*last) < MIN_CALL_INTERVAL)
    {
        return Err("Slow down — Vibyra is pacing AI requests.".into());
    }
    let last_minute = inner
        .recent
        .iter()
        .filter(|at| now.duration_since(**at) < MINUTE)
        .count();
    if last_minute >= MAX_CALLS_PER_MINUTE {
        return Err(format!(
            "Rate limit reached ({MAX_CALLS_PER_MINUTE} AI requests a minute). Try again shortly."
        ));
    }
    budget(&inner.ledger, &inner.recent, limits, estimate_usd)
}

/// The user's configured ceilings. Checked against a worst-case estimate so
/// a call that would cross a cap never leaves the machine.
pub(crate) fn budget(
    ledger: &UsageLedger,
    recent: &[Instant],
    limits: AiLimits,
    estimate_usd: f64,
) -> Result<(), String> {
    const RAISE: &str = "Raise it in Settings › Vibyra AI.";
    if limits.hourly_calls > 0 && recent.len() as u32 >= limits.hourly_calls {
        return Err(format!(
            "Hourly limit reached ({} requests). {RAISE}",
            limits.hourly_calls
        ));
    }
    if limits.daily_calls > 0 && ledger.calls() >= limits.daily_calls {
        return Err(format!(
            "Daily limit reached ({} requests). {RAISE}",
            limits.daily_calls
        ));
    }
    if capped(limits.daily_spend_usd) && ledger.spend_usd + estimate_usd > limits.daily_spend_usd {
        return Err(format!(
            "Daily spend cap reached (${:.2}). {RAISE}",
            limits.daily_spend_usd
        ));
    }
    if capped(limits.monthly_spend_usd)
        && ledger.month_spend_usd + estimate_usd > limits.monthly_spend_usd
    {
        return Err(format!(
            "Monthly spend cap reached (${:.2}). {RAISE}",
            limits.monthly_spend_usd
        ));
    }
    Ok(())
}

pub(crate) fn prune(recent: &mut Vec<Instant>) {
    let now = Instant::now();
    recent.retain(|at| now.duration_since(*at) < HOUR);
}
