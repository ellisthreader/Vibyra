mod approval;
mod edits;
mod events;
mod policy;
mod runtime;
mod storage;
use serde_json::{json, Value};
use vibyra_core::agent_chats::AgentChat;
use vibyra_core::agent_runs::AgentRun;
use vibyra_core::agent_runtime::{
    rpc::Client, AgentEvent, PermissionBridge, TurnCommand, TurnExit, TurnHandle,
};

pub struct ServerTurn<'a> {
    pub chat: &'a AgentChat,
    pub task: &'a AgentRun,
    pub images: &'a [String],
    pub bridge: &'a PermissionBridge,
    pub handle: &'a TurnHandle,
    pub state_root: &'a std::path::Path,
}
pub fn run(
    turn_request: ServerTurn<'_>,
    mut command: TurnCommand,
    mut emit: impl FnMut(AgentEvent),
    mut artifact: impl FnMut(&str, &str, &str) -> Result<(), String>,
) -> Result<TurnExit, String> {
    let ServerTurn {
        chat,
        task,
        images,
        bridge,
        handle,
        state_root,
    } = turn_request;
    let prompt = task.spec.prompt.clone();
    command.program = "codex".into();
    // Keep runtime databases in this Vibyra account, avoiding shared mutable
    // CLI SQLite files while terminals start and migrate their own runtime.
    let sqlite_home = storage::prepare(
        state_root,
        task.spec.account_id.as_deref().unwrap_or("default"),
        &command,
        handle,
    )?;
    command.args = vec![
        "app-server".into(),
        "-c".into(),
        format!(
            "sqlite_home={}",
            serde_json::to_string(&sqlite_home.to_string_lossy()).map_err(|e| e.to_string())?
        ),
    ];
    let mut client = Client::start(command, handle)?;
    // Cold provider database migrations can exceed the ordinary RPC deadline.
    // receive_wire still observes cancellation every 100 ms while starting.
    client.request_with_timeout("initialize", json!({"clientInfo":{"name":"vibyra","version":"0.4.3"},"capabilities":{"experimentalApi":true}}), std::time::Duration::from_secs(120))?;
    client.send(json!({"method":"initialized"}))?;
    let loaded = client.request(
        "config/read",
        json!({"includeLayers":false,"cwd":task.spec.cwd}),
    )?;
    let profile = policy::profile(task);
    let mut params = json!({"cwd":task.spec.cwd,"permissions":profile,"approvalPolicy":"untrusted",
        "approvalsReviewer":"user","config":policy::config(task, &loaded, &runtime::executables(client.process_id())),"developerInstructions":task.spec.context,"dynamicTools":crate::agent_mode::bridge::proposal_tools::dynamic()});
    if let Some(model) = &task.spec.model {
        params["model"] = json!(model);
    }
    let method = if let Some(session) = &chat.session_id {
        params["threadId"] = json!(session);
        "thread/resume"
    } else {
        "thread/start"
    };
    let response = client.request(method, params)?;
    policy::verify(&response, &profile)?;
    artifact("provider", "Resolved provider settings", &json!({
        "model": response["model"], "reasoningEffort": response["reasoningEffort"],
        "permissionProfile": response["activePermissionProfile"], "approvalPolicy": response["approvalPolicy"]
    }).to_string())?;
    let thread = response
        .pointer("/thread/id")
        .and_then(Value::as_str)
        .ok_or("Codex returned no thread id.")?
        .to_owned();
    emit(AgentEvent::SessionIdentified {
        session_id: thread.clone(),
    });
    let mut input = vec![json!({"type":"text","text":prompt,"text_elements":[]})];
    for image in images {
        input.push(json!({"type":"localImage","path":image}));
    }
    // Inherit the profile just verified on this fresh/resumed thread.
    // Re-selecting its name here reloads global config without the thread's
    // inline definitions (Codex 0.153.4), rather than reusing that profile.
    let mut start =
        json!({"threadId":thread,"input":input,"cwd":task.spec.cwd,"approvalPolicy":"untrusted"});
    if let Some(effort) = &task.spec.effort {
        start["effort"] = json!(effort);
    }
    let response = client.request("turn/start", start)?;
    let turn = response
        .pointer("/turn/id")
        .and_then(Value::as_str)
        .ok_or("Codex returned no turn id.")?
        .to_owned();
    let mut usage = None;
    let mut edits = edits::Pending::default();
    loop {
        if handle.cancelled() {
            return Ok(TurnExit::Cancelled);
        }
        let Some(message) = client.receive()? else {
            continue;
        };
        let method = events::text(&message, "method");
        let params = &message["params"];
        if message.get("method").is_none() {
            continue;
        }
        if let Some(id) = message.get("id") {
            let matching = params["threadId"].as_str() == Some(&thread)
                && params["turnId"].as_str() == Some(&turn);
            let result = if matching && method == "item/fileChange/requestApproval" {
                edits.respond(params, bridge)
            } else if matching {
                approval::respond(&method, params, bridge)
            } else {
                json!({"decision":"cancel"})
            };
            client.send(json!({"id":id,"result":result}))?;
            continue;
        }
        if params["threadId"].as_str().is_some_and(|id| id != thread) {
            continue;
        }
        if params["turnId"].as_str().is_some_and(|id| id != turn) {
            continue;
        }
        edits.observe(&method, params);
        if method == "turn/completed" {
            if params.pointer("/turn/id").and_then(Value::as_str) != Some(&turn) {
                continue;
            }
            if let Some(event) = usage.take() {
                emit(event);
            }
            return Ok(
                match params.pointer("/turn/status").and_then(Value::as_str) {
                    Some("completed") => {
                        emit(AgentEvent::TurnCompleted {
                            result: String::new(),
                        });
                        TurnExit::Completed
                    }
                    Some("interrupted") => TurnExit::Cancelled,
                    _ => TurnExit::Failed(
                        params
                            .pointer("/turn/error/message")
                            .and_then(Value::as_str)
                            .unwrap_or("Codex did not complete this task.")
                            .into(),
                    ),
                },
            );
        }
        if method == "thread/tokenUsage/updated" {
            let reported = &params["tokenUsage"]["last"];
            usage = Some(AgentEvent::UsageUpdated {
                input_tokens: reported["inputTokens"].as_i64().unwrap_or(0),
                output_tokens: reported["outputTokens"].as_i64().unwrap_or(0),
                cost_usd: None,
            });
        }
        if method == "item/completed"
            && params["item"]["type"] == "fileChange"
            && params["item"]["status"] == "completed"
        {
            for change in params["item"]["changes"].as_array().into_iter().flatten() {
                artifact(
                    "diff",
                    &events::text(change, "path"),
                    &events::text(change, "diff"),
                )?;
            }
        }
        for event in events::normalize(&method, params) {
            emit(event.bounded());
        }
    }
}

#[cfg(test)]
mod tests;
