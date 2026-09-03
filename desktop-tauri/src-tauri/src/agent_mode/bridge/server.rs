//! A minimal MCP server over stdio: one tool, `approve`.
//!
//! JSON-RPC 2.0, one message per line, as Claude speaks it to a stdio server.
//! Everything Claude needs to get as far as calling the tool is answered
//! here; everything else is a polite "method not found".

use std::io::{BufRead, Write};

use serde_json::{json, Value};

use super::wire::{BridgeRequest, Env, Wire};

const PROTOCOL: &str = "2025-06-18";

/// Reads requests until stdin closes.
pub fn serve(
    wire: &dyn Wire,
    env: &Env,
    input: impl BufRead,
    mut output: impl Write,
) -> Result<(), String> {
    for line in input.lines() {
        let line = line.map_err(|error| format!("stdin: {error}"))?;
        if let Some(response) = handle(&line, wire, env) {
            writeln!(output, "{response}").map_err(|error| format!("stdout: {error}"))?;
            output.flush().map_err(|error| format!("stdout: {error}"))?;
        }
    }
    Ok(())
}

/// One message in, at most one message out. Notifications get no reply.
pub fn handle(line: &str, wire: &dyn Wire, env: &Env) -> Option<String> {
    let line = line.trim();
    if line.is_empty() {
        return None;
    }
    let message: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(error) => return Some(error_response(Value::Null, -32700, &error.to_string())),
    };
    let id = message.get("id").cloned();
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    // No id means a notification, and a notification is never answered —
    // answering `notifications/initialized` is the classic way to break a
    // client that is not expecting a message.
    let id = id?;
    let result = match method {
        "initialize" => initialize(&params),
        "ping" => json!({}),
        "tools/list" => json!({ "tools": [approve_tool()] }),
        "tools/call" => return Some(call(id, &params, wire, env)),
        other => {
            return Some(error_response(
                id,
                -32601,
                &format!("unknown method {other}"),
            ))
        }
    };
    Some(json!({ "jsonrpc": "2.0", "id": id, "result": result }).to_string())
}

fn initialize(params: &Value) -> Value {
    let version = params
        .get("protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or(PROTOCOL);
    json!({
        "protocolVersion": version,
        "capabilities": { "tools": {} },
        "serverInfo": { "name": "vibyra", "version": env!("CARGO_PKG_VERSION") }
    })
}

fn approve_tool() -> Value {
    json!({
        "name": "approve",
        "description": "Asks the person running Vibyra whether this tool call may proceed.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "tool_name": { "type": "string" },
                "input": { "type": "object" },
                "tool_use_id": { "type": "string" }
            },
            "required": ["tool_name", "input"]
        }
    })
}

fn call(id: Value, params: &Value, wire: &dyn Wire, env: &Env) -> String {
    let name = params.get("name").and_then(Value::as_str).unwrap_or("");
    if name != "approve" {
        return error_response(id, -32602, &format!("no tool named {name}"));
    }
    let arguments = params.get("arguments").cloned().unwrap_or(Value::Null);
    let request = BridgeRequest {
        token: env.token.clone(),
        chat_id: env.chat_id.clone(),
        turn_id: env.turn_id.clone(),
        tool_name: arguments
            .get("tool_name")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_string(),
        input: arguments.get("input").cloned().unwrap_or(json!({})),
    };
    let reply = wire.ask(request);
    let text = serde_json::to_string(&reply).unwrap_or_else(|_| {
        r#"{"behavior":"deny","message":"Vibyra could not encode its answer."}"#.into()
    });
    json!({
        "jsonrpc": "2.0",
        "id": id,
        "result": { "content": [{ "type": "text", "text": text }] }
    })
    .to_string()
}

fn error_response(id: Value, code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } }).to_string()
}
