use super::{normalize, publish, requests};
use crate::state::Shared;
use serde_json::{json, Value};

#[cfg(test)]
pub(crate) fn receive(shared: &Shared, id: &str, value: Value) {
    receive_guarded(shared, id, None, value);
}
pub(crate) fn receive_generation(shared: &Shared, id: &str, generation: &str, value: Value) {
    receive_guarded(shared, id, Some(generation), value);
}
fn receive_guarded(shared: &Shared, id: &str, generation: Option<&str>, value: Value) {
    let mut state = shared.lock();
    if generation.is_some_and(|g| {
        state
            .conversations
            .get(id)
            .is_none_or(|c| c.generation != g)
    }) {
        return;
    }
    let complete_detail = state
        .journal
        .conversation_detail(id, &value["params"]["itemId"]);
    let Some(c) = state.conversations.get_mut(id) else {
        return;
    };
    let method = value["method"].as_str().unwrap_or("");
    let p = &value["params"];
    if p["threadId"]
        .as_str()
        .is_some_and(|thread| !c.thread_id.is_empty() && thread != c.thread_id)
    {
        return;
    }
    let mut item = None;
    if value.get("id").is_some() {
        if let Some(previous) = c
            .items
            .iter()
            .find(|i| i.get("rpcId").is_some() && i["rpcId"] == value["id"])
        {
            if previous["action"] != *p || previous["method"] != method {
                if let Some(runtime) = &c.runtime {
                    runtime.stop();
                }
            }
            return;
        }
        let detail = c
            .items
            .iter()
            .find(|i| i["id"] == p["itemId"])
            .filter(|i| i["truncated"] != true)
            .and_then(|i| i["detail"].as_str())
            .unwrap_or("")
            .to_owned();
        let detail = complete_detail.unwrap_or(detail);
        let pending_count = c
            .items
            .iter()
            .filter(|i| matches!(i["status"].as_str(), Some("pending" | "responding")))
            .count();
        item = if pending_count < 2 {
            requests::pending(method, &value["id"], p, &detail)
        } else {
            None
        };
        let pending_bytes: usize = c
            .items
            .iter()
            .filter(|i| matches!(i["status"].as_str(), Some("pending" | "responding")))
            .map(|i| {
                let mut public = i.clone();
                super::archive::public_item(&mut public);
                public.to_string().len()
            })
            .sum();
        if item.as_ref().is_some_and(|i| {
            let mut public = i.clone();
            super::archive::public_item(&mut public);
            public["detail"] = json!(super::model::bounded(
                public["detail"].as_str().unwrap_or(""),
                6000
            ));
            pending_bytes + public.to_string().len() > 24 * 1024
        }) {
            item = None;
        }
        if item.is_none() {
            // The stock CLI can present provider requests beyond the phone's
            // supported cards. Only delegate while that private local peer exists.
            if c.runtime.as_ref().is_some_and(|r| {
                r.bridge
                    .lock()
                    .as_ref()
                    .is_some_and(|b| b.peer.lock().is_some())
            }) {
                return;
            }
            if let Some(runtime) = &c.runtime {
                let _ = runtime.write(json!({"id":value["id"],"error":{"code":-32601,
                    "message":"This request cannot be safely presented by Vibyra; action was not approved"}}));
            }
            let _ = publish(
                &mut state,
                id,
                Some(
                    json!({"id":format!("unsupported:{}",value["id"]),"turnId":p["turnId"],
                "kind":"activity","status":"failed","title":"Request could not be approved",
                "detail":"This provider request has an unsupported or incomplete permission scope. No approval was granted. Continue in a native terminal on your Mac if this access is required."}),
                ),
            );
            return;
        }
        c.turn_state = "waiting".into();
    } else {
        match method {
            "turn/started" => {
                c.turn_started_at = Some(crate::now());
                c.turn_id = p["turn"]["id"].as_str().map(str::to_owned);
                c.turn_state = "running".into();
                if let Some(receipt) = c
                    .active_submission
                    .as_ref()
                    .and_then(|id| c.receipts.get_mut(id))
                {
                    receipt["status"] = json!("accepted");
                    receipt["turnId"] = p["turn"]["id"].clone();
                }
            }
            "turn/completed" => {
                c.turn_id = p["turn"]["id"].as_str().map(str::to_owned);
                c.turn_state = match p["turn"]["status"].as_str() {
                    Some("completed") => "completed",
                    Some("interrupted") => "interrupted",
                    _ => "failed",
                }
                .into();
                for old in &mut c.items {
                    if matches!(old["status"].as_str(), Some("pending" | "responding")) {
                        old["status"] = json!(if old["status"] == "pending" {
                            "expired"
                        } else {
                            "unknown"
                        });
                    }
                }
                item = Some(
                    json!({"id":format!("result:{}",c.turn_id.as_deref().unwrap_or("unknown")),
                    "turnId":c.turn_id,"kind":"result","status":c.turn_state,
                    "durationMs":c.turn_started_at.as_deref().and_then(|time| chrono::DateTime::parse_from_rfc3339(time).ok())
                        .map(|start| (chrono::Utc::now() - start.with_timezone(&chrono::Utc)).num_milliseconds().max(0)),
                    "title":match c.turn_state.as_str(){"completed"=>"Finished","interrupted"=>"Stopped",_=>"Something went wrong"},
                    "text":p["turn"]["error"]["message"]}),
                );
            }
            "item/started" | "item/completed" => {
                if super::terminal_events::already_submitted(c, &p["item"]) {
                    return;
                }
                if p["item"]["type"] == "dynamicToolCall"
                    && p["item"]["tool"] == super::question_tool::NAME
                {
                    if method == "item/completed" {
                        item = super::acknowledgement::resolved(c, &p["item"]["id"], true);
                    }
                } else {
                    item = normalize::item(&p["item"], &p["turnId"], method == "item/completed");
                }
                if item.is_none() {
                    return;
                }
            }
            "item/agentMessage/delta"
            | "item/commandExecution/outputDelta"
            | "item/reasoning/summaryTextDelta" => {
                item = super::deltas::apply(c, method, p);
                if item.is_none() {
                    return;
                }
            }
            "thread/tokenUsage/updated" => {
                c.usage = p["tokenUsage"].clone();
            }
            "thread/settings/updated" => super::terminal_events::settings(c, &p["threadSettings"]),
            "serverRequest/resolved" => {
                item = super::acknowledgement::resolved(c, &p["requestId"], false);
            }
            "vibyra/processExited" => {
                c.restore();
                if let Some(session) = state.sessions.get_mut(id) {
                    session.meta.status = "interrupted".into();
                    session.lease = None;
                }
                if let Ok(session) = state.session(id) {
                    let _ = state.journal.save(session);
                }
                state.emit("host.changed", json!({}));
            }
            _ => return,
        }
    }
    let pending = item
        .clone()
        .filter(|i| i["kind"] == "permission" && i["status"] == "pending");
    let result = publish(&mut state, id, item).and_then(|_| {
        if let Some(request) = pending {
            super::policy::auto_approve(&mut state, id, &request)?;
        }
        Ok(())
    });
    if let Err(error) = result {
        super::storage_failure(&mut state, id, &error);
    }
}
