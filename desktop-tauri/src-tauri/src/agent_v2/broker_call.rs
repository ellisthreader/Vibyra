//! Forwarding one `tools/call` to the backend broker and turning its
//! ActionOutcome into the text the model reads.

use super::{text_result, Broker};
use crate::agent_v2::api::ApiError;
use serde_json::Value;
use std::time::Instant;

const WAITING: [&str; 3] = ["pending_approval", "approved", "dispatching"];

pub(super) async fn forward(broker: &Broker, body: Value) -> Value {
    let action = match broker.api.call_tool(&broker.run_id, body).await {
        Ok(action) => action,
        Err(error) => return refused(&error),
    };
    if !WAITING.contains(&action["state"].as_str().unwrap_or_default()) {
        return outcome(&action);
    }
    // A write: the run waits for the person's exact approval. Poll the action
    // (this works even after cancellation) and give the model its final result.
    let Some(action_id) = action["id"].as_str().map(str::to_owned) else {
        return text_result("The approval request could not be tracked.", true);
    };
    let started = Instant::now();
    let mut last = action;
    while started.elapsed() < broker.approval_wait {
        tokio::time::sleep(broker.poll).await;
        match broker
            .api
            .action(&broker.run_id, broker.generation, &action_id)
            .await
        {
            Ok(current) if WAITING.contains(&current["state"].as_str().unwrap_or_default()) => {
                last = current
            }
            Ok(current) => return outcome(&current),
            Err(error @ ApiError::Refused { .. }) => return refused(&error),
            // A lost response is retried; the action keeps its server state.
            Err(ApiError::Network(_)) => {}
        }
    }
    let summary = last["summary"].as_str().unwrap_or("This action");
    text_result(
        &format!("{summary} is still waiting for the person's approval. Tell them it is waiting instead of retrying."),
        true,
    )
}

/// The model-facing result of a settled action.
pub(super) fn outcome(action: &Value) -> Value {
    let state = action["state"].as_str().unwrap_or("unknown");
    let result = &action["result"];
    match state {
        "completed" => text_result(&compact(result), false),
        "declined" => text_result("The person declined this action. Do not retry it.", true),
        "expired" => text_result(
            "The approval request expired before the person answered.",
            true,
        ),
        "cancelled" => text_result("This task was cancelled.", true),
        _ => {
            let message = result["error"]
                .as_str()
                .map(str::to_owned)
                .unwrap_or_else(|| format!("The action ended as {state}."));
            text_result(&message, true)
        }
    }
}

fn refused(error: &ApiError) -> Value {
    let text = match error.code() {
        Some("stale_lease" | "run_cancelled" | "run_finished") => {
            "This task was stopped. Do not continue."
        }
        Some("run_not_active") => {
            "Another action is waiting for approval. Wait for it before calling more tools."
        }
        Some("arguments_too_large") => "The tool arguments are too large.",
        Some("call_conflict") => "This call id was already used with different input.",
        Some(_) => "Vibyra refused this tool call.",
        None => "Vibyra Cloud could not be reached for this tool call.",
    };
    text_result(text, true)
}

fn compact(result: &Value) -> String {
    match result {
        Value::String(text) => text.clone(),
        Value::Null => "Done.".into(),
        other => other.to_string(),
    }
}
