//! The broker-only gate. A run starts only when Claude Code proves, before
//! and at session start, that its whole tool surface is the Vibyra broker
//! and that it runs on the subscription login rather than an API key.

use super::stream::Init;
use super::tools::SERVER;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq)]
pub struct Refusal {
    /// Contract `fail` code: `provider_signin` or `provider_error`.
    pub code: &'static str,
    pub reason: String,
}

fn refuse(code: &'static str, reason: impl Into<String>) -> Refusal {
    Refusal {
        code,
        reason: reason.into(),
    }
}

/// `control_request initialize`: a signed-in first-party account.
pub fn check_initialize(response: &Value) -> Result<(), Refusal> {
    let account = &response["account"];
    let signed_in = ["email", "subscriptionType"]
        .iter()
        .any(|key| account[key].as_str().is_some_and(|v| !v.is_empty()));
    if !signed_in {
        return Err(refuse(
            "provider_signin",
            "Claude Code is not signed in. Sign in to this Claude account in Vibyra.",
        ));
    }
    match account["apiProvider"].as_str() {
        None | Some("firstParty") => Ok(()),
        Some(other) => Err(refuse(
            "provider_error",
            format!("This Claude account uses {other}, not a Claude subscription login."),
        )),
    }
}

/// `control_request mcp_status`. `Ok(false)` means still connecting.
pub fn check_mcp_status(response: &Value) -> Result<bool, Refusal> {
    let servers = response["mcpServers"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if servers.iter().any(|s| s["name"] != SERVER) {
        return Err(refuse(
            "provider_error",
            "Claude Code loaded an MCP server other than the Vibyra broker.",
        ));
    }
    let Some(broker) = servers.first() else {
        return Err(refuse(
            "provider_error",
            "The Vibyra broker did not load in Claude Code.",
        ));
    };
    match broker["status"].as_str() {
        Some("connected") => Ok(servers.len() == 1),
        Some("pending") | None => Ok(false),
        Some(status) => Err(refuse(
            "provider_error",
            format!("The Vibyra broker could not start in Claude Code ({status})."),
        )),
    }
}

/// The first `system/init`: no API key, only the broker, and exactly the
/// manifest's tools — nothing more and nothing missing.
pub fn check_init(init: &Init, expected: &[String]) -> Result<(), Refusal> {
    if init.api_key_source != "none" {
        return Err(refuse(
            "provider_error",
            format!(
                "Claude Code would bill an API key ({}); Agent runs use your Claude login only.",
                init.api_key_source
            ),
        ));
    }
    if init.mcp_servers.len() != 1 || init.mcp_servers[0].0 != SERVER {
        return Err(refuse(
            "provider_error",
            "Claude Code loaded MCP servers other than the Vibyra broker.",
        ));
    }
    let mut actual = init.tools.clone();
    let mut wanted = expected.to_vec();
    actual.sort();
    wanted.sort();
    let duplicate = actual.windows(2).any(|pair| pair[0] == pair[1]);
    if actual != wanted || duplicate {
        let extra: Vec<_> = init
            .tools
            .iter()
            .filter(|t| !expected.contains(t))
            .take(5)
            .cloned()
            .collect();
        let reason = if extra.is_empty() {
            "Claude Code did not expose this task's Vibyra tools.".to_owned()
        } else {
            format!(
                "Claude Code exposed tools outside the Vibyra broker ({}).",
                extra.join(", ")
            )
        };
        return Err(refuse("provider_error", reason));
    }
    Ok(())
}

#[cfg(test)]
#[path = "preflight_tests.rs"]
mod tests;
