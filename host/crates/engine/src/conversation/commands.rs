use crate::{text, Engine};
use serde_json::{json, Value};

pub(super) fn catalogue() -> Value {
    let rows = [
        (
            "help",
            "Commands available in this conversation",
            "read",
            "",
        ),
        (
            "status",
            "Session, account and effective settings",
            "read",
            "",
        ),
        ("usage", "Thread tokens and account limits", "read", ""),
        (
            "model",
            "Choose the model for your next turn",
            "settings",
            "",
        ),
        (
            "effort",
            "Choose reasoning effort for your next turn",
            "settings",
            "reasoning",
        ),
        (
            "permissions",
            "Execution policy and approval scopes",
            "read",
            "approvals",
        ),
        (
            "diff",
            "Inspect this conversation's recorded changes",
            "read",
            "",
        ),
        (
            "context",
            "Inspect observed files, searches and summaries",
            "read",
            "",
        ),
        ("stop", "Interrupt the active turn", "input", ""),
    ];
    let native_only = "ide keymap vim setup-default-sandbox sandbox-add-read-dir agent subagents apps plugins hooks rename archive delete experimental approve memories skills import feedback init logout mcp mention fast goal personality ps fork app side btw raw debug-config statusline title theme pets pet copy exit quit";
    let mut result = json!({"version":1,"provider":"codex","commands":rows.into_iter().map(|(name,description,scope,alias)|
    json!({"name":name,"description":description,"scope":scope,"aliases":if alias.is_empty(){vec![]}else{vec![alias]},
        "available":true})).collect::<Vec<_>>(),
    "unsupported":[
        {"name":"plan","reason":"This session has no verified collaboration-mode transition."},
        {"name":"review","reason":"Use a native Codex terminal for a separate review execution."},
        {"name":"compact","reason":"Explicit compaction is not enabled for this session."},
        {"name":"new","reason":"Use New terminal on your Mac to preserve project and account selection."},
        {"name":"resume","reason":"Use Resume Codex on the saved terminal to continue its original thread."},
        {"name":"clear","reason":"History is retained; start a new terminal on your Mac."}
    ]});
    for name in native_only.split_whitespace() {
        result["unsupported"].as_array_mut().unwrap().push(json!({"name":name,
            "reason":"This is a native Codex terminal operation. Open an explicit native terminal on your Mac; it is a separate execution."}));
    }
    result
}
impl Engine {
    pub(crate) fn conversation_command(
        &self,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = text(params, "sessionId")?;
        let state = self.shared.lock();
        let session = state.session(id)?;
        let c = state
            .conversations
            .get(id)
            .ok_or("Conversation not found")?;
        if method == "conversation.commands" {
            let mut commands = catalogue();
            commands["provider"] = json!(session.meta.kind);
            if session.meta.kind != "codex" {
                commands["unsupported"] = json!([]);
                for command in commands["commands"].as_array_mut().unwrap() {
                    if command["name"] == "usage" {
                        command["description"] = json!("Reported conversation token usage");
                    }
                }
            }
            return Ok(commands);
        }
        if method == "conversation.status" {
            return Ok(
                json!({"sessionId":id,"projectId":session.meta.project_id,"provider":session.meta.kind,
                "savedRules":state.journal.trust_rules(&session.meta.project_id)?,
                "workingDirectory":c.working_directory,"settings":c.settings,"activeSettings":c.active_settings,"usage":c.usage,
                "turnState":c.turn_state,"processState":c.process_state,"generation":c.generation,
                "controlOwner":session.lease.as_ref().map(|lease|&lease.device),
                "observedAt":crate::now(),"retention":{"outputBytes":262144,"outputBudgetBytes":67108864,"attachmentBudgetBytes":16777216}}),
            );
        }
        let runtime = c
            .runtime
            .clone()
            .ok_or("Live provider data is unavailable for this saved conversation")?;
        let usage = c.usage.clone();
        drop(state);
        if method == "conversation.models" {
            let mut models = Vec::new();
            let mut cursor = Value::Null;
            for _ in 0..16 {
                let page = runtime.request(
                    "model/list",
                    json!({"limit":100,"cursor":cursor,"includeHidden":false}),
                )?;
                models.extend(page["data"].as_array().cloned().unwrap_or_default());
                cursor = page["nextCursor"].clone();
                if cursor.is_null() {
                    break;
                }
            }
            if !cursor.is_null() {
                return Err("Model catalogue exceeded its page limit".into());
            }
            return Ok(json!({"models":models}));
        }
        let limits = runtime.request("account/rateLimits/read", json!({}));
        Ok(match limits {
            Ok(limits) => json!({"thread":usage,"account":limits,"observedAt":crate::now(),
                "historyAvailability":"Daily, weekly and lifetime token history is not exposed by this runtime."}),
            Err(error) => json!({"thread":usage,"account":null,"unavailable":error.message}),
        })
    }
}
