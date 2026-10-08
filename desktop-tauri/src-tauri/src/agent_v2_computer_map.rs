//! Pure mapping between an Agent V2 computer action and the existing, tested
//! Agent Computer primitives (V1 request shape), plus the receipts the backend
//! validates. No I/O here, so every rule is unit-tested.

use serde_json::{json, Value};
use sha2::{Digest, Sha256};

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Op {
    /// A read through the grant's Host Engine (`agent_computer_tools::read`).
    Read(&'static str),
    /// Approved edit in the Agent worktree (`vibes.tool write_file`).
    Edit,
    /// Approved hash-pinned shell test in the disconnected VM.
    Test,
    /// Exact byte upload for the server's GitHub write.
    Publish,
}

impl Op {
    pub fn is_write(self) -> bool {
        !matches!(self, Op::Read(_))
    }

    fn v1_operation(self) -> &'static str {
        match self {
            Op::Read(name) => name,
            Op::Edit => "write_file",
            Op::Test => "run_test",
            Op::Publish => "publish_branch",
        }
    }
}

/// Only these tools ever run on the Mac; anything else is ignored.
pub(crate) fn map(tool: &str) -> Option<Op> {
    Some(match tool {
        "workspace_list" => Op::Read("list_files"),
        "workspace_read" => Op::Read("read_file"),
        "workspace_search" => Op::Read("search_files"),
        "workspace_changes" => Op::Read("git_publish_preview"),
        "workspace_edit" => Op::Edit,
        "run_test" => Op::Test,
        "publish_branch" => Op::Publish,
        _ => return None,
    })
}

/// The request shape the V1 primitives check: an exact operation, a claimed
/// (`dispatching`) approval fingerprint, and the run as the Host binding's chat.
pub(crate) fn v1_request(op: Op, action: &Value, run_id: &str) -> Value {
    let arguments = match &action["arguments"] {
        Value::Object(map) => Value::Object(map.clone()),
        _ => json!({}),
    };
    json!({"id": action["id"], "turnId": run_id, "operation": op.v1_operation(),
        "arguments": arguments, "expiresAt": action["expiresAt"],
        "approval": {"state": "dispatching", "fingerprint": action["fingerprint"]}})
}

/// A backend-supplied id that may go into a request path or a grant lookup.
pub(crate) fn plain_id(id: &str) -> bool {
    crate::agent_computer_access::looks_uuid(id)
}

/// Does this listed action still stand as claimed by this lease generation?
pub(crate) fn claimed_by(action: &Value, generation: u64) -> bool {
    action["state"] == "dispatching" && action["claimedGeneration"].as_u64() == Some(generation)
}

/// A refusal is exactly `{error}` (≤400 chars), as the backend requires.
pub(crate) fn refusal(error: impl Into<String>) -> Value {
    let error: String = error.into();
    json!({"error": error.chars().take(400).collect::<String>()})
}

fn refused(result: &Value) -> Option<Value> {
    result["error"].as_str().map(refusal)
}

/// Edit receipt: the Host's write receipt plus the worktree digest after it
/// (the diff fingerprint), or the Host refusal alone.
pub(crate) fn edit_receipt(result: Value, snapshot: Option<String>) -> Value {
    if let Some(error) = refused(&result) {
        return error;
    }
    json!({"written": result["written"], "path": result["path"], "sha256": result["sha256"],
        "snapshotSha256": snapshot})
}

/// VM test receipt plus a digest of its bounded output.
#[allow(dead_code)] // The shell-test VM is not part of this build yet.
pub(crate) fn test_receipt(receipt: Value) -> Value {
    if let Some(error) = refused(&receipt) {
        return error;
    }
    let mut receipt = receipt;
    let digest = format!(
        "{:x}",
        Sha256::digest(receipt["output"].as_str().unwrap_or_default().as_bytes())
    );
    receipt["outputSha256"] = json!(digest);
    receipt
}

pub(crate) fn publish_receipt(upload: Result<Value, String>) -> Value {
    match upload {
        Ok(upload) => json!({ "upload": upload }),
        Err(error) => refusal(error),
    }
}

pub(crate) fn read_receipt(result: Value) -> Value {
    refused(&result).unwrap_or(result)
}

#[cfg(test)]
#[path = "agent_v2_computer_ids_tests.rs"]
mod ids_tests;

#[cfg(test)]
#[path = "agent_v2_computer_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "agent_v2_computer_worktree_tests.rs"]
mod worktree_tests;
