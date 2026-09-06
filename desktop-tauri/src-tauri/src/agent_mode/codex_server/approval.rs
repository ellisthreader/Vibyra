use crate::agent_mode::bridge::wire::{BridgeRequest, TcpWire, Wire};
use serde_json::{json, Value};
use vibyra_core::agent_runtime::PermissionBridge;

/// Only a single command may be approved. Escalations cannot widen the task's sandbox.
pub fn respond(method: &str, params: &Value, bridge: &PermissionBridge) -> Value {
    if method == "item/tool/call" {
        let tool = params["tool"].as_str().unwrap_or("");
        let reply = if ["propose_memory", "propose_skill"].contains(&tool) {
            TcpWire::new(bridge.port).ask(BridgeRequest {
                token: bridge.token.clone(),
                chat_id: bridge.chat_id.clone(),
                turn_id: bridge.turn_id.clone(),
                tool_name: tool.into(),
                tool_use_id: params["callId"].as_str().map(str::to_owned),
                input: params["arguments"].clone(),
            })
        } else {
            crate::agent_mode::bridge::wire::BridgeReply::deny("This tool is unavailable.")
        };
        return json!({"success":reply.behavior == "allow","contentItems":[{"type":"inputText","text":serde_json::to_string(&reply).unwrap_or_default()}]});
    }
    if method == "item/permissions/requestApproval" {
        return json!({"permissions":{},"scope":"turn"});
    }
    if method == "mcpServer/elicitation/request" {
        return json!({"action":"decline","content":null});
    }
    if method != "item/commandExecution/requestApproval" {
        return json!({"decision":"decline"});
    }
    if !params["additionalPermissions"].is_null()
        || !params["networkApprovalContext"].is_null()
        || params["kind"]
            .as_str()
            .is_some_and(|kind| kind != "command")
    {
        return json!({"decision":"decline"});
    }
    let Some(command) = params["command"].as_str() else {
        return json!({"decision":"decline"});
    };
    let reply = TcpWire::new(bridge.port).ask(BridgeRequest {
        token: bridge.token.clone(),
        chat_id: bridge.chat_id.clone(),
        turn_id: bridge.turn_id.clone(),
        tool_name: "Bash".into(),
        tool_use_id: params["approvalId"]
            .as_str()
            .or(params["itemId"].as_str())
            .map(str::to_owned),
        input: json!({"command":command,"cwd":params["cwd"],"providerRequest":params}),
    });
    json!({"decision":if reply.behavior == "allow" { "accept" } else { "decline" }})
}
