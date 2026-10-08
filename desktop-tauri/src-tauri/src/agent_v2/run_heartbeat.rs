//! The lease heartbeat beside a running provider: every 20 s, and its
//! answer decides whether the run continues, is interrupted, or is abandoned.

use crate::agent_v2::api::{ApiError, RunnerApi};
use crate::agent_v2::execute::Control;
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

const HEARTBEAT: Duration = Duration::from_secs(20);
const TERMINAL: [&str; 4] = ["completed", "failed", "cancelled", "outcome_unknown"];

#[derive(Debug, PartialEq)]
pub enum Verdict {
    Continue,
    Cancel,
    Stale,
    Steer,
}

/// What one heartbeat answer means for the running provider.
pub fn verdict(result: &Result<Value, ApiError>) -> Verdict {
    match result {
        Ok(beat) if beat["cancelRequested"] == true => Verdict::Cancel,
        Ok(beat) if TERMINAL.contains(&beat["state"].as_str().unwrap_or_default()) => {
            Verdict::Cancel
        }
        Ok(beat) if beat["steeringRequested"] == true => Verdict::Steer,
        Ok(_) | Err(ApiError::Network(_)) => Verdict::Continue,
        Err(error) if error.code() == Some("stale_lease") => Verdict::Stale,
        Err(error) if error.fences() => Verdict::Cancel,
        // Other refusals (throttle, 5xx): keep going; the lease tolerates a miss.
        Err(_) => Verdict::Continue,
    }
}

pub(super) async fn heartbeat(
    api: RunnerApi,
    run: String,
    generation: u64,
    control: Arc<Control>,
    done: Arc<AtomicBool>,
) {
    while !done.load(Ordering::SeqCst) {
        tokio::time::sleep(HEARTBEAT).await;
        match verdict(&api.heartbeat(&run, generation).await) {
            Verdict::Continue => {}
            Verdict::Cancel => control.cancel.store(true, Ordering::SeqCst),
            Verdict::Steer => {
                control.steering.store(true, Ordering::SeqCst);
                control.stale.store(true, Ordering::SeqCst);
                return;
            }
            Verdict::Stale => {
                control.stale.store(true, Ordering::SeqCst);
                return;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn refused(code: &str) -> Result<Value, ApiError> {
        Err(ApiError::Refused {
            status: 409,
            code: code.into(),
            message: String::new(),
        })
    }

    #[test]
    fn heartbeat_answers_drive_cancel_and_stale_lease() {
        assert_eq!(
            verdict(&Ok(json!({"state": "running", "cancelRequested": false}))),
            Verdict::Continue
        );
        assert_eq!(
            verdict(&Ok(json!({"state": "running", "cancelRequested": true}))),
            Verdict::Cancel
        );
        assert_eq!(
            verdict(&Ok(json!({"state": "cancelled", "cancelRequested": false}))),
            Verdict::Cancel
        );
        assert_eq!(
            verdict(&Ok(json!({"state":"running", "steeringRequested":true}))),
            Verdict::Steer
        );
        assert_eq!(
            verdict(&Ok(json!({"state":"cancelled", "steeringRequested":true}))),
            Verdict::Cancel
        );
        assert_eq!(verdict(&refused("stale_lease")), Verdict::Stale);
        assert_eq!(verdict(&refused("run_finished")), Verdict::Cancel);
        assert_eq!(verdict(&refused("throttled")), Verdict::Continue);
        assert_eq!(
            verdict(&Err(ApiError::Network("x".into()))),
            Verdict::Continue
        );
    }
}
