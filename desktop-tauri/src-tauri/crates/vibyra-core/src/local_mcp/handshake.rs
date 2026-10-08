//! Deciding which protocol era a server speaks. Per the 2026-07-28 stdio rules a
//! dual-era client probes `server/discover` first: a result means modern, a
//! recognised modern error means "modern, version mismatch" (never fall back),
//! and anything else, or silence, means a legacy server, which gets `initialize`.
//! A legacy server that is merely slow to start still answers the probe late,
//! and a late `DiscoverResult` is honoured.

use super::conn::{Conn, Era};
use super::error::McpError;
use super::rpc::outcome;
use serde_json::{json, Value};
use std::time::Instant;

pub const MODERN: &str = "2026-07-28";
const LEGACY_OFFER: &str = "2025-11-25";
const LEGACY_KNOWN: [&str; 4] = ["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"];
const UNSUPPORTED_VERSION: i64 = -32022;

pub fn run(conn: &mut Conn) -> Result<Era, McpError> {
    let now = Instant::now();
    let deadline = now + conn.limits.start_timeout;
    let probe_end = deadline.min(now + conn.limits.probe_timeout);
    conn.era = Era::Modern(MODERN.into());
    let discover = conn.send("server/discover", json!({}))?;
    if let Some((_, message)) = conn.wait(&[discover], probe_end)? {
        if message["error"]["code"].as_i64() == Some(UNSUPPORTED_VERSION) {
            return Err(McpError::Handshake(format!(
                "This server speaks protocol versions {} but Vibyra offers {MODERN} or an earlier handshake-based version.",
                message["error"]["data"]["supported"]
            )));
        }
        if let Ok(result) = outcome(&message) {
            return modern(conn, &result);
        }
    }
    conn.era = Era::Pending;
    legacy(conn, discover, deadline)
}

/// A clean child after a legacy server exited on the discovery probe.
pub fn legacy_start(conn: &mut Conn) -> Result<Era, McpError> {
    conn.era = Era::Pending;
    legacy(conn, 0, Instant::now() + conn.limits.start_timeout)
}

fn modern(conn: &mut Conn, result: &Value) -> Result<Era, McpError> {
    let supported = result["supportedVersions"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    if !supported.iter().any(|v| v == MODERN) {
        return Err(McpError::Handshake(format!(
            "This server does not support protocol version {MODERN}."
        )));
    }
    conn.era = Era::Modern(MODERN.into());
    Ok(conn.era.clone())
}

fn legacy(conn: &mut Conn, discover: u64, deadline: Instant) -> Result<Era, McpError> {
    let init = conn.send(
        "initialize",
        json!({"protocolVersion": LEGACY_OFFER, "capabilities": {},
            "clientInfo": {"name": "vibyra", "version": env!("CARGO_PKG_VERSION")}}),
    )?;
    loop {
        match conn.wait(&[discover, init], deadline)? {
            None => return Err(slow(conn)),
            Some((id, message)) if id == discover => {
                if let Ok(result) = outcome(&message) {
                    if result["supportedVersions"].is_array() {
                        return modern(conn, &result); // a late DiscoverResult
                    }
                }
            }
            Some((_, message)) => {
                let result = outcome(&message).map_err(|e| {
                    McpError::Handshake(format!("The server refused to start. {e}"))
                })?;
                let version = result["protocolVersion"].as_str().unwrap_or_default();
                if !LEGACY_KNOWN.contains(&version) {
                    return Err(McpError::Handshake(format!(
                        "This server answered with protocol version \"{version}\", which Vibyra does not speak."
                    )));
                }
                conn.notify("notifications/initialized", json!({}));
                conn.era = Era::Legacy(version.to_owned());
                return Ok(conn.era.clone());
            }
        }
    }
}

fn slow(conn: &Conn) -> McpError {
    let waited = conn.limits.start_timeout.as_secs_f32().ceil();
    let mut why = format!("The server did not finish starting within {waited} seconds.");
    if let Some(noise) = &conn.last_noise {
        why.push_str(&format!(" It wrote text that is not MCP: \"{noise}\"."));
    }
    let tail = conn.stderr_tail();
    if !tail.is_empty() {
        why.push_str(&format!(" Its error output ended: {tail}"));
    }
    McpError::Handshake(why)
}
