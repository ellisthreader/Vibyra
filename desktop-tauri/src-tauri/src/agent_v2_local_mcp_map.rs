//! Pure mapping for local MCP actions: what the backend lists, the claim body,
//! and the receipt for each outcome. No I/O, so every rule is unit-tested.

use serde_json::{json, Value};
use vibyra_core::local_mcp::{CallResult, McpError, ToolDef};

/// One approved call the backend wants run on this Mac.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Job {
    pub local_id: String,
    pub connection_id: String,
    pub remote_name: String,
    pub arguments: Value,
    pub is_write: bool,
}

pub(crate) fn job(action: &Value) -> Option<Job> {
    let server = &action["server"];
    let text = |value: &Value, max: usize| {
        value
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= max)
            .map(str::to_owned)
    };
    Some(Job {
        local_id: text(&server["localId"], 64)?,
        connection_id: text(&server["connectionId"], 36)?,
        remote_name: text(&server["remoteName"], 128)?,
        arguments: match &action["arguments"] {
            Value::Object(map) => Value::Object(map.clone()),
            _ => json!({}),
        },
        is_write: action["kind"] == "write",
    })
}

pub(crate) fn claimed_by(action: &Value, generation: u64) -> bool {
    action["claimedGeneration"].as_u64() == Some(generation) && action["state"] == "dispatching"
}

/// The tools the server lists right now, re-posted at every claim so the
/// backend can refuse a call if they are no longer what the person reviewed.
pub(crate) fn claim_with(action: &Value, generation: u64, live: &[ToolDef]) -> Value {
    json!({"generation": generation, "fingerprint": action["fingerprint"],
        "tools": live.iter().map(ToolDef::catalogue).collect::<Vec<_>>()})
}

/// The server cannot be reached: the call is closed as refused, visibly, nothing sent.
pub(crate) fn claim_unavailable(
    action: &Value,
    generation: u64,
    reason: &str,
    error: &str,
) -> Value {
    json!({"generation": generation, "fingerprint": action["fingerprint"],
        "unavailable": {"reason": reason, "error": clip(error, 300)}})
}

pub(crate) fn clip(text: &str, max: usize) -> String {
    let mut end = text.len().min(max);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    text[..end].to_owned()
}

/// The receipt for a finished call. A write that was sent but not confirmed
/// (timeout, crash, lost or oversized output) is `unknown`: never repeated.
pub(crate) fn receipt(result: Result<CallResult, McpError>, is_write: bool) -> Value {
    match result {
        Ok(done) => {
            let mut body = json!({"text": done.text});
            if let Some(structured) = done.structured {
                body["structured"] = structured;
            }
            if done.truncated {
                body["truncated"] = json!(true);
            }
            if done.is_error {
                body["isError"] = json!(true);
            }
            body
        }
        Err(error) => {
            let sent = matches!(
                error,
                McpError::Timeout(_) | McpError::Crashed(_) | McpError::TooLarge(_)
            );
            let mut body =
                json!({"error": clip(&error.to_string(), 480), "reason": error.reason()});
            if is_write && sent {
                body["unknown"] = json!(true);
            }
            body
        }
    }
}

/// The receipt for a result the backend refused to record (413, 422): a write may have run.
pub(crate) fn unrecordable(is_write: bool) -> Value {
    let mut body = json!({"error": "The result could not be recorded.", "reason": "unavailable"});
    if is_write {
        body["error"] = json!("The tool may have run, but its result could not be recorded.");
        body["unknown"] = json!(true);
    }
    body
}
