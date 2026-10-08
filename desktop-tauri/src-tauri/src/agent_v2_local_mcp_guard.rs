//! A local MCP call under the secret guard (roadmap Part 16): with `guard.secrets`
//! on in the claim, a call naming a sensitive file is refused before anything is
//! sent to the server (so a write is a plain refusal, never an unknown outcome)
//! and the result text is redacted.

use super::map::Job;
use std::path::Path;
use vibyra_core::local_mcp::{guard, CallResult, McpError, ServerSpec, Supervisor};

pub(crate) fn call(
    supervisor: &Supervisor,
    dir: &Path,
    spec: &ServerSpec,
    job: &Job,
    secrets: bool,
) -> Result<CallResult, McpError> {
    if secrets {
        if let Some(why) = guard::refusal(dir, spec, &job.arguments) {
            return Err(McpError::Invalid(why));
        }
    }
    let done = supervisor.call_tool(spec, &job.remote_name, &job.arguments)?;
    Ok(if secrets {
        guard::redact_result(done)
    } else {
        done
    })
}

#[cfg(test)]
#[path = "agent_v2_local_mcp_guard_tests.rs"]
mod tests;
