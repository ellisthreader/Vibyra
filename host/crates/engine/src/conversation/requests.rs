use super::{authorize, publish};
use crate::{identifier, text, Engine};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub(crate) fn pending(method: &str, rpc: &Value, p: &Value, detail: &str) -> Option<Value> {
    let kind = match method {
        "item/commandExecution/requestApproval" | "item/fileChange/requestApproval" => "permission",
        "item/tool/requestUserInput" => "question",
        "item/tool/call" if p["tool"] == super::question_tool::NAME => "question",
        _ => return None,
    };
    let questions = if method == "item/tool/call" {
        &p["arguments"]["questions"]
    } else {
        &p["questions"]
    };
    if kind == "question" && !super::question_tool::valid(questions) {
        return None;
    }
    // Never approve an action whose exact payload could not be shown on the phone.
    if p.to_string().len() + detail.len() > 7000
        || (kind == "question" && questions.as_array()?.len() > 3)
    {
        return None;
    }
    if method == "item/fileChange/requestApproval" && !p["grantRoot"].is_null() {
        return None;
    }
    if method == "item/commandExecution/requestApproval"
        && (p["command"].as_str().is_none()
            || p["kind"].as_str().is_some_and(|kind| kind != "command"))
    {
        return None;
    }
    if method == "item/fileChange/requestApproval" && matches!(detail, "" | "null" | "[]") {
        return None;
    }
    if ["additionalPermissions", "networkApprovalContext"]
        .iter()
        .any(|key| !p[key].is_null())
    {
        return None;
    }
    if p["availableDecisions"].as_array().is_some_and(|choices| {
        !choices.contains(&json!("accept")) || !choices.contains(&json!("decline"))
    }) {
        return None;
    }
    let request = uuid::Uuid::new_v4().to_string();
    let version = format!(
        "{:x}",
        Sha256::digest(format!("{method}:{rpc}:{p}:{detail}"))
    );
    let command = p["command"].as_str().unwrap_or(detail);
    Some(
        json!({"id":request,"requestId":request,"turnId":p["turnId"],"kind":kind,
        "title":if kind=="question" {"A quick question"} else if method.contains("fileChange") {"Allow these file changes?"} else {"Allow this command?"},
        "text":p["reason"],"detail":command,"scope":p["cwd"],"status":"pending","actionVersion":version,
        "questions":questions,"rpcId":rpc,"method":method,"action":p}),
    )
}
pub(super) fn answers(item: &Value, params: &Value) -> Result<Value, String> {
    let supplied = params["answers"]
        .as_object()
        .ok_or("Answers are required")?;
    let questions = item["questions"]
        .as_array()
        .ok_or("Questions are unavailable")?;
    if supplied.len() != questions.len() {
        return Err("Answer each question once".into());
    }
    for question in questions {
        let id = question["id"]
            .as_str()
            .ok_or("Question ID is unavailable")?;
        let values = supplied
            .get(id)
            .and_then(|v| v["answers"].as_array())
            .ok_or("Answer every question")?;
        if values.is_empty() || values.len() > 8 {
            return Err("Choose an answer".into());
        }
        for value in values {
            let text = value
                .as_str()
                .filter(|s| !s.trim().is_empty() && s.len() <= 4096)
                .ok_or("Answer must contain 1–4096 bytes")?;
            let options = question["options"].as_array();
            if !question["isOther"].as_bool().unwrap_or(false)
                && options.is_some_and(|o| !o.is_empty())
                && !options.unwrap().iter().any(|o| o["label"] == text)
            {
                return Err("Choose a listed answer".into());
            }
        }
    }
    Ok(json!({"answers":supplied}))
}
impl Engine {
    pub(crate) fn resolve_request(
        &self,
        device: &str,
        method: &str,
        params: &Value,
    ) -> Result<Value, String> {
        let id = text(params, "sessionId")?;
        let request = text(params, "requestId")?;
        let decision_id = text(params, "decisionId")?;
        identifier(decision_id)?;
        let mut state = self.shared.lock();
        authorize(state.session(id)?, device, params)?;
        let c = state
            .conversations
            .get_mut(id)
            .ok_or("Conversation not found")?;
        let mut item = c
            .items
            .iter()
            .find(|i| i["requestId"] == request)
            .cloned()
            .ok_or("Request expired")?;
        if item["actionVersion"] != params["actionVersion"] {
            return Err("The action changed; refresh before responding".into());
        }
        if c.turn_id.as_deref() != item["turnId"].as_str() {
            return Err("Request belongs to an earlier turn".into());
        }
        let result = if method == "question.answer" && item["kind"] == "question" {
            answers(&item, params)?
        } else if method == "decision.resolve" && item["kind"] == "permission" {
            let decision = text(params, "decision")?;
            if !matches!(decision, "accept" | "decline") {
                return Err("Choose Allow once or Decline".into());
            }
            json!({"decision":decision})
        } else {
            return Err("Wrong response type for this request".into());
        };
        let result = if item["method"] == "item/tool/call" {
            super::question_tool::result(result)
        } else {
            result
        };
        if let Some(receipt) = c.receipts.get(decision_id) {
            if receipt["device"] != device
                || receipt["requestId"] != request
                || receipt["response"] != result
            {
                return Err("Decision ID was reused for another response".into());
            }
            return Ok(json!({"decisionId":decision_id,"status":item["status"]}));
        }
        if item["status"] != "pending" {
            return Err("This request has already been answered or expired".into());
        }
        if c.receipts.len() >= 4096 {
            return Err("Conversation receipt limit reached".into());
        }
        let runtime = c
            .runtime
            .clone()
            .ok_or("Conversation process is unavailable")?;
        c.receipts.insert(
            decision_id.into(),
            json!({"device":device,"requestId":request,"response":result,"status":"dispatching"}),
        );
        item["status"] = json!("responding");
        item["decision"] = result["decision"].clone();
        item["decisionId"] = json!(decision_id);
        // Persist before writing the provider response. A lost acknowledgement never resends execution.
        publish(&mut state, id, Some(item.clone()))?;
        let written = runtime.write(json!({"id":item["rpcId"],"result":result}));
        if written.is_err() {
            item["status"] = json!("unknown");
            publish(&mut state, id, Some(item))?;
        }
        Ok(
            json!({"decisionId":decision_id,"status":if written.is_ok(){"responding"}else{"unknown"}}),
        )
    }
}
