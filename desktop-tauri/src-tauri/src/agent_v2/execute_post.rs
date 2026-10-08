//! Posting a run's output: batched deltas, the one terminal call, and the
//! fencing codes that mean "stop and discard".

use super::{Backend, Outcome};
use crate::agent_v2::api::ApiError;
use std::time::{Duration, Instant};

/// The longest final answer the server accepts (contract §7). A longer one is
/// cut with a notice: it would be refused and the run would never finish.
pub(super) const MAX_ANSWER: usize = 60_000;
const NOTICE: &str = "\n\n[Shortened: this answer was longer than Vibyra can save.]";
const BACKOFF: Duration = if cfg!(test) {
    Duration::from_millis(5)
} else {
    Duration::from_millis(500)
};

pub(super) fn clip_answer(answer: &str) -> String {
    if answer.chars().count() <= MAX_ANSWER {
        return answer.to_owned();
    }
    let mut clipped: String = answer
        .chars()
        .take(MAX_ANSWER - NOTICE.chars().count())
        .collect();
    clipped.push_str(NOTICE);
    clipped
}

/// A lost connection, a rate limit or a server hiccup may pass.
fn transient(error: &ApiError) -> bool {
    matches!(
        error,
        ApiError::Network(_)
            | ApiError::Refused {
                status: 408 | 429 | 500..=599,
                ..
            }
    )
}

/// Posts the final answer (cut to the limit). Transient losses are retried
/// briefly; a fence stops; any other refusal is a 4xx the server will never
/// accept, so the run is failed once with `runner_error` and stops instead of
/// being left for a lease-expiry re-claim that would re-run Claude forever.
pub(super) fn complete(backend: &dyn Backend, answer: &str) -> Outcome {
    let answer = clip_answer(answer);
    let mut result = backend.complete(&answer);
    for _ in 0..3 {
        match &result {
            Err(error) if transient(error) => {
                std::thread::sleep(BACKOFF);
                result = backend.complete(&answer);
            }
            _ => break,
        }
    }
    match result {
        Ok(()) => Outcome::Completed,
        Err(error) if error.fences() => fenced(&error),
        Err(error) if !transient(&error) => fail(
            backend,
            "runner_error",
            "Vibyra could not save this answer.",
        ),
        Err(error) => fenced(&error),
    }
}

/// A reason that names nothing on this computer (no paths, user names or
/// process output), for failures whose detail came from local output.
pub(super) fn plain_reason(code: &str) -> &'static str {
    match code {
        "limits" => "Claude Code reported a usage limit.",
        "provider_signin" => "Claude Code needs you to sign in.",
        "step_limit" => "Claude Code reached its step limit.",
        _ => "Claude Code stopped before finishing.",
    }
}

pub(super) fn flush(
    backend: &dyn Backend,
    pending: &mut String,
    since: &mut Option<Instant>,
) -> Result<(), Outcome> {
    *since = None;
    if pending.is_empty() {
        return Ok(());
    }
    let text = std::mem::take(pending);
    let chunks: Vec<(&str, String)> = text
        .chars()
        .collect::<Vec<_>>()
        .chunks(8000)
        .map(|chunk| ("message.delta", chunk.iter().collect()))
        .collect();
    match retry(|| backend.events(&chunks)) {
        Err(error) if error.fences() => Err(fenced(&error)),
        // A lost delta is cosmetic; the final answer is posted with /complete.
        _ => Ok(()),
    }
}

pub(super) fn fenced(error: &ApiError) -> Outcome {
    match error.code() {
        Some("stale_lease") => Outcome::Stale,
        Some("instruction_pending") => Outcome::Steered,
        Some("run_cancelled" | "run_finished") => Outcome::Cancelled,
        _ => Outcome::Failed(error.to_string()),
    }
}

pub(super) fn fail(backend: &dyn Backend, code: &str, reason: &str) -> Outcome {
    match retry(|| backend.fail(code, reason)) {
        Err(error) if error.fences() => fenced(&error),
        _ => Outcome::Failed(code.to_owned()),
    }
}

/// `limits` carries the reset time; every other code is an ordinary `fail`.
pub(super) fn fail_or_wait(
    backend: &dyn Backend,
    code: &str,
    reason: &str,
    resets_at: Option<i64>,
) -> Outcome {
    if code != "limits" {
        return fail(backend, code, reason);
    }
    match retry(|| backend.pause(reason, resets_at)) {
        Err(error) if error.fences() => fenced(&error),
        _ => Outcome::Failed(code.to_owned()),
    }
}

/// Network losses are retried briefly; refusals are final.
pub(super) fn retry(mut call: impl FnMut() -> Result<(), ApiError>) -> Result<(), ApiError> {
    let mut result = call();
    for _ in 0..2 {
        if !matches!(result, Err(ApiError::Network(_))) {
            break;
        }
        std::thread::sleep(BACKOFF);
        result = call();
    }
    result
}
