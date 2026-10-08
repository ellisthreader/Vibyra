//! The zero-cost preflight: `initialize` then `mcp_status` over stream-json,
//! before any user message (so no model call is made if it fails).

use super::Control;
use crate::agent_v2::preflight::{check_initialize, check_mcp_status, Refusal};
use crate::agent_v2::session::{Next, Session};
use crate::agent_v2::stream::{parse, Line};
use serde_json::Value;
use std::sync::atomic::Ordering;
use std::time::{Duration, Instant};

pub enum Stop {
    Refused(Refusal),
    Cancelled,
    Stale,
}

fn refused(code: &'static str, reason: impl Into<String>) -> Stop {
    Stop::Refused(Refusal {
        code,
        reason: reason.into(),
    })
}

pub fn preflight(session: &mut Session, control: &Control) -> Result<(), Stop> {
    session
        .control("vibyra-init", "initialize")
        .map_err(|reason| refused("provider_error", reason))?;
    let init = answer(session, control, "vibyra-init", Duration::from_secs(45))?;
    check_initialize(&init).map_err(Stop::Refused)?;
    let deadline = Instant::now() + Duration::from_secs(20);
    for attempt in 0.. {
        let id = format!("vibyra-mcp-{attempt}");
        session
            .control(&id, "mcp_status")
            .map_err(|reason| refused("provider_error", reason))?;
        let status = answer(session, control, &id, Duration::from_secs(15))?;
        if check_mcp_status(&status).map_err(Stop::Refused)? {
            return Ok(());
        }
        if Instant::now() > deadline {
            break;
        }
        std::thread::sleep(Duration::from_millis(300));
    }
    Err(refused(
        "provider_error",
        "The Vibyra broker did not connect to Claude Code in time.",
    ))
}

/// Waits for the control response with `id`, ignoring other lines.
fn answer(
    session: &mut Session,
    control: &Control,
    id: &str,
    wait: Duration,
) -> Result<Value, Stop> {
    let deadline = Instant::now() + wait;
    while Instant::now() < deadline {
        if control.stale.load(Ordering::SeqCst) {
            return Err(Stop::Stale);
        }
        if control.cancel.load(Ordering::SeqCst) {
            return Err(Stop::Cancelled);
        }
        match session.next(Duration::from_millis(200)) {
            Next::Line(line) => match parse(&line) {
                Line::ControlResponse {
                    id: got,
                    ok,
                    body,
                    error,
                } if got == id => {
                    return if ok {
                        Ok(body)
                    } else {
                        Err(refused(
                            "provider_error",
                            format!("Claude Code refused the preflight: {error}"),
                        ))
                    };
                }
                Line::ControlRequest { id, .. } => {
                    let _ = session.deny(&id);
                }
                _ => {}
            },
            Next::Idle => {}
            Next::Closed => {
                let tail = session.stderr_tail();
                let (code, reason) = crate::agent_v2::stream::classify_failure(
                    "",
                    &format!("Claude Code stopped during its preflight. {tail}"),
                    false,
                );
                let code = if code == "provider_signin" {
                    "provider_signin"
                } else {
                    "provider_error"
                };
                return Err(refused(code, reason));
            }
        }
    }
    Err(refused(
        "provider_error",
        "Claude Code did not answer its preflight in time.",
    ))
}
