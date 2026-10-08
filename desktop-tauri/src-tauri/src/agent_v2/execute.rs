//! Drives one claimed run through Claude Code: preflight gate, prompt,
//! streamed output, and exactly one of complete / fail / stop.

use super::api::ApiError;
use super::claude_cmd::Launch;
use super::preflight::{check_init, Refusal};
use super::session::{Next, Session};
use super::stream::{classify_failure, parse, Line};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};

#[path = "execute_preflight.rs"]
mod gate;
#[path = "execute_post.rs"]
mod post;
use post::{complete, fail, fail_or_wait, flush, plain_reason};

pub trait Backend {
    fn events(&self, events: &[(&str, String)]) -> Result<(), ApiError>;
    fn complete(&self, answer: &str) -> Result<(), ApiError>;
    fn fail(&self, code: &str, reason: &str) -> Result<(), ApiError>;
    /// `limits` with the provider's reset time (unix seconds), so the backend
    /// parks the run until then instead of re-offering it every lease.
    fn pause(&self, reason: &str, resume_at: Option<i64>) -> Result<(), ApiError> {
        let _ = resume_at;
        self.fail("limits", reason)
    }
}

/// Set by the heartbeat: `cancel` interrupts, `stale` abandons at once.
#[derive(Default)]
pub struct Control {
    pub cancel: AtomicBool,
    pub stale: AtomicBool,
    pub steering: AtomicBool,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Outcome {
    Completed,
    Failed(String),
    Cancelled,
    Stale,
    Steered,
}

pub struct Plan {
    pub launch: Launch,
    pub prompt: String,
    /// Inline attachment blocks sent after the prompt text (`attachments.rs`).
    pub attachments: Vec<serde_json::Value>,
    pub expected_tools: Vec<String>,
    /// Created once the init gate passes; the broker refuses calls before it.
    pub armed_path: std::path::PathBuf,
    pub wall: Duration,
    pub interrupt_grace: Duration,
}

pub fn execute(plan: &Plan, backend: &dyn Backend, control: &Control) -> Outcome {
    let mut session = match Session::start(&plan.launch) {
        Ok(session) => session,
        Err(reason) => return fail(backend, "runner_error", &reason),
    };
    if let Err(stop) = gate::preflight(&mut session, control) {
        session.stop(Duration::ZERO);
        return match stop {
            gate::Stop::Refused(Refusal { code, reason }) => fail(backend, code, &reason),
            gate::Stop::Cancelled => Outcome::Cancelled,
            gate::Stop::Stale => Outcome::Stale,
        };
    }
    if let Err(reason) = session.send_user(&plan.prompt, &plan.attachments) {
        return fail(backend, "provider_error", &reason);
    }
    let outcome = stream(plan, &mut session, backend, control);
    session.stop(Duration::from_secs(2));
    outcome
}

fn stream(plan: &Plan, session: &mut Session, backend: &dyn Backend, control: &Control) -> Outcome {
    let started = Instant::now();
    let (mut gated, mut rate_limited) = (false, false);
    let mut resets_at: Option<i64> = None;
    let mut interrupted: Option<Instant> = None;
    let mut pending = String::new();
    let mut pending_since: Option<Instant> = None;
    let mut last_text = String::new();
    loop {
        if control.stale.load(Ordering::SeqCst) {
            return Outcome::Stale;
        }
        let over_time = started.elapsed() > plan.wall;
        if (control.cancel.load(Ordering::SeqCst) || over_time) && interrupted.is_none() {
            let _ = session.control("interrupt", "interrupt");
            interrupted = Some(Instant::now());
        }
        if interrupted.is_some_and(|at| at.elapsed() > plan.interrupt_grace) {
            session.stop(Duration::from_secs(1));
            return if over_time && !control.cancel.load(Ordering::SeqCst) {
                fail(
                    backend,
                    "runner_error",
                    "The task ran longer than the Agent time limit.",
                )
            } else {
                Outcome::Cancelled
            };
        }
        let flush_due = pending_since.is_some_and(|at| at.elapsed() >= Duration::from_millis(800));
        if flush_due || pending.len() >= 4000 {
            if let Err(stop) = flush(backend, &mut pending, &mut pending_since) {
                return stop;
            }
        }
        let line = match session.next(Duration::from_millis(200)) {
            Next::Line(line) => line,
            Next::Idle => continue,
            Next::Closed if interrupted.is_some() => return Outcome::Cancelled,
            Next::Closed => {
                // The stderr tail names paths and users: it decides the code, never the reason.
                let tail = session.stderr_tail();
                let (code, _) = classify_failure("", &tail, rate_limited);
                return fail_or_wait(backend, code, plain_reason(code), resets_at);
            }
        };
        match parse(&line) {
            Line::Init(init) if !gated => {
                if let Err(Refusal { code, reason }) = check_init(&init, &plan.expected_tools) {
                    session.stop(Duration::ZERO);
                    return fail(backend, code, &reason);
                }
                if std::fs::write(&plan.armed_path, b"armed").is_err() {
                    return fail(
                        backend,
                        "runner_error",
                        "The Vibyra broker could not be enabled.",
                    );
                }
                gated = true;
            }
            Line::TextDelta(text) => {
                pending.push_str(&text);
                pending_since.get_or_insert_with(Instant::now);
            }
            Line::AssistantText(text) if !text.trim().is_empty() => last_text = text,
            Line::RateLimit {
                status,
                resets_at: at,
            } => {
                rate_limited = !matches!(status.as_str(), "allowed" | "allowed_warning");
                resets_at = at.or(resets_at);
            }
            Line::ControlRequest { id, .. } => {
                let _ = session.deny(&id);
            }
            Line::Result {
                is_error,
                subtype,
                text,
            } => {
                if interrupted.is_some() && control.cancel.load(Ordering::SeqCst) {
                    return Outcome::Cancelled;
                }
                if !gated {
                    return fail(
                        backend,
                        "provider_error",
                        "Claude Code never reported its tool list.",
                    );
                }
                if let Err(stop) = flush(backend, &mut pending, &mut pending_since) {
                    return stop;
                }
                let answer = if text.trim().is_empty() {
                    last_text.clone()
                } else {
                    text
                };
                if is_error || answer.trim().is_empty() {
                    let (code, reason) = classify_failure(&subtype, &answer, rate_limited);
                    return fail_or_wait(backend, code, &reason, resets_at);
                }
                return complete(backend, &answer);
            }
            _ => {}
        }
    }
}

#[cfg(test)]
#[path = "execute_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "execute_live_tests.rs"]
mod live_tests;
