//! `vibyra_run_app`: an agent asks the host to run its project's desktop app
//! outside the agent sandbox, where the app's window can exist. The host
//! decides what runs; an unapproved command becomes a Run card for the owner.
//! Work happens on a thread: the runtime's event worker must never wait.

use super::run_card::{card, show};
use super::runtime::Runtime;
use crate::state::Shared;
use crate::{RunOutcome, RunRequest};
use serde_json::{json, Value};
use std::sync::Arc;

pub(crate) const NAME: &str = "vibyra_run_app";
pub(crate) const INSTRUCTIONS: &str = "Never start desktop or GUI apps (tauri dev, electron, cargo run of an app, open -a) with shell commands: your sandbox blocks their windows, so they run invisibly. Call vibyra_run_app with the app's package script or command instead. The host runs it outside your sandbox on the user's computer once they approve it, then its window opens on the phone that asked. Poll vibyra_preview_status until it reports displaying, and report build errors from its log lines. Websites need no tool: run their dev server as usual.";

pub(super) fn spec() -> Value {
    json!({"type":"function","name":NAME,"description":"Run this project's desktop app on the user's computer, outside the sandbox, so its window can be shown on their phone. Name a detected app id or give the command (for example `npm run tauri:dev`). The user approves a new command once.",
        "inputSchema":{"type":"object","additionalProperties":false,"properties":{
            "target":{"type":"string","maxLength":200,"description":"An app id from a previous result"},
            "command":{"type":"string","maxLength":300,"description":"The command that starts the app, as argv"}}}})
}

struct Context {
    runtime: Arc<Runtime>,
    provider: crate::PreviewRunProvider,
    request: RunRequest,
    generation: String,
}

/// Claims this tool's call; the answer is written later from a thread.
pub(super) fn receive(shared: &Shared, id: &str, generation: Option<&str>, value: &Value) -> bool {
    if value.get("id").is_none()
        || value["method"] != "item/tool/call"
        || value["params"]["tool"] != NAME
    {
        return false;
    }
    let Some((context, runtime)) = context(shared, id, generation, value) else {
        return true;
    };
    let Some(context) = context else {
        reply(
            &runtime,
            &value["id"],
            false,
            &json!({"error":"Running apps is unavailable on this host. Ask the user to start it on their computer."}),
        );
        return true;
    };
    let arguments = &value["params"]["arguments"];
    let text = |key: &str| {
        arguments[key]
            .as_str()
            .map(|s| s.chars().take(300).collect())
    };
    let request = RunRequest {
        target: text("target"),
        command: text("command"),
        ..context.request.clone()
    };
    let (shared, id, call) = (Arc::clone(shared), id.to_owned(), value.clone());
    let context = Context { request, ..context };
    let spawned = std::thread::Builder::new()
        .name("vibyra-run-app".into())
        .spawn(move || ask(&shared, &id, &call, context));
    if spawned.is_err() {
        reply(
            &runtime,
            &value["id"],
            false,
            &json!({"error":"The host is busy; try again."}),
        );
    }
    true
}

type Found = (Option<Context>, Arc<Runtime>);

fn context(shared: &Shared, id: &str, generation: Option<&str>, value: &Value) -> Option<Found> {
    let state = shared.lock();
    let c = state.conversations.get(id)?;
    if generation.is_some_and(|g| g != c.generation) || value["params"]["threadId"] != c.thread_id {
        return None;
    }
    let runtime = c.runtime.clone()?;
    let session = state.sessions.get(id)?;
    let device = session
        .lease
        .as_ref()
        .map_or_else(|| "desktop".into(), |lease| lease.device.clone());
    let context = state.preview_run.clone().map(|provider| Context {
        runtime: Arc::clone(&runtime),
        provider,
        request: RunRequest {
            device,
            project: session.meta.project_id.clone(),
            root: c.working_directory.clone(),
            ..Default::default()
        },
        generation: c.generation.clone(),
    });
    Some((context, runtime))
}

fn ask(shared: &Shared, id: &str, value: &Value, context: Context) {
    let outcome = (context.provider)(&context.request);
    if !current(shared, id, &context.generation) {
        return;
    }
    match outcome {
        Ok(RunOutcome::Started(status)) => {
            reply(&context.runtime, &value["id"], true, &started(status))
        }
        Ok(RunOutcome::NeedsApproval {
            token,
            name,
            command,
            cwd,
            body,
        }) => {
            let card = card(value, &token, &name, &command, &cwd, body.as_deref());
            if let Err(error) = show(shared, id, &context.generation, card) {
                reply(
                    &context.runtime,
                    &value["id"],
                    false,
                    &json!({"error":error}),
                );
            }
        }
        Err(error) => reply(
            &context.runtime,
            &value["id"],
            false,
            &json!({"error":error}),
        ),
    }
}

/// The owner answered the Run card. Declining answers at once; approving runs
/// the exact plan the host showed, as the device that approved it.
pub(super) fn resolve(
    shared: &Shared,
    id: &str,
    item: &Value,
    device: &str,
    runtime: Arc<Runtime>,
) {
    let rpc = item["rpcId"].clone();
    if item["decision"] == "decline" {
        reply(
            &runtime,
            &rpc,
            false,
            &json!({"error":"The user declined running this app."}),
        );
        return;
    }
    let found = {
        let state = shared.lock();
        let project = state.sessions.get(id).map(|s| s.meta.project_id.clone());
        let conversation = state.conversations.get(id);
        let root = conversation.and_then(|c| c.working_directory.clone());
        let generation = conversation.map(|c| c.generation.clone());
        (state.preview_run.clone(), project, root, generation)
    };
    let (Some(provider), Some(project), root, Some(generation)) = found else {
        reply(
            &runtime,
            &rpc,
            false,
            &json!({"error":"Running apps is unavailable on this host."}),
        );
        return;
    };
    let request = RunRequest {
        device: device.into(),
        project,
        root,
        approve_token: item["action"]["vibyraRunToken"].as_str().map(str::to_owned),
        ..Default::default()
    };
    let shared = Arc::clone(shared);
    let id = id.to_owned();
    let (fallback, failed_rpc) = (Arc::clone(&runtime), rpc.clone());
    let spawned = std::thread::Builder::new()
        .name("vibyra-run-app".into())
        .spawn(move || {
            let outcome = provider(&request);
            if !current(&shared, &id, &generation) {
                return;
            }
            match outcome {
                Ok(RunOutcome::Started(status)) => reply(&runtime, &rpc, true, &started(status)),
                Ok(RunOutcome::NeedsApproval { .. }) => reply(
                    &runtime,
                    &rpc,
                    false,
                    &json!({"error":"The app changed while waiting for approval. Ask again."}),
                ),
                Err(error) => reply(&runtime, &rpc, false, &json!({"error":error})),
            }
        });
    if spawned.is_err() {
        reply(
            &fallback,
            &failed_rpc,
            false,
            &json!({"error":"The host is busy; try again."}),
        );
    }
}

fn started(status: Value) -> Value {
    json!({"started":true,"run":status,"next":"Poll vibyra_preview_status until it reports displaying. The window opens on the phone that asked; report build errors from the log lines."})
}

fn current(shared: &Shared, id: &str, generation: &str) -> bool {
    shared
        .lock()
        .conversations
        .get(id)
        .is_some_and(|c| c.generation == generation)
}

fn reply(runtime: &Runtime, rpc: &Value, success: bool, body: &Value) {
    let _ = runtime.write(json!({"id":rpc,"result":{"success":success,
        "contentItems":[{"type":"inputText","text":body.to_string()}]}}));
}

#[cfg(test)]
#[path = "run_tool_tests.rs"]
mod tests;
