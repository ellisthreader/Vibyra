use serde_json::{json, Value};
use sha2::{Digest, Sha256};
pub(crate) fn pending(method: &str, rpc: &Value, p: &Value, detail: &str) -> Option<Value> {
    let permissions = method == "item/permissions/requestApproval";
    let kind = match method {
        "vibyra/tool/requestApproval"
        | "item/commandExecution/requestApproval"
        | "item/fileChange/requestApproval"
        | "item/permissions/requestApproval" => "permission",
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
    // Extra roots have unstable provider enforcement; never promise an unverified scope.
    if method == "item/fileChange/requestApproval"
        && (!p["grantRoot"].is_null() || matches!(detail, "" | "null" | "[]"))
    {
        return None;
    }
    if permissions
        && (!p["permissions"].is_object()
            || (p["permissions"]["network"].is_null() && p["permissions"]["fileSystem"].is_null()))
    {
        return None;
    }
    let network = p["networkApprovalContext"].is_object();
    if method == "item/commandExecution/requestApproval"
        && ((!network && p["command"].as_str().is_none())
            || p["kind"].as_str().is_some_and(|kind| kind != "command"))
    {
        return None;
    }
    // Command-specific additionalPermissions is not the typed permissions request contract.
    if !p["additionalPermissions"].is_null() {
        return None;
    }
    let budget = if kind == "question" { 7000 } else { 256 * 1024 };
    if p.to_string().len() + detail.len() > budget {
        return None;
    }
    let review = if method == "vibyra/tool/requestApproval" {
        serde_json::to_string_pretty(&super::observed::redact(&p["input"])).ok()?
    } else if network || permissions {
        serde_json::to_string_pretty(p).ok()?
    } else if method.contains("fileChange") {
        detail.to_owned()
    } else {
        p["command"].as_str().unwrap_or(detail).to_owned()
    };
    let request = uuid::Uuid::new_v4().to_string();
    let version = format!(
        "{:x}",
        Sha256::digest(format!("{method}:{rpc}:{p}:{detail}"))
    );
    let choices: Vec<_> = ["decline", "accept", "acceptForSession"]
        .into_iter()
        .filter(|choice| {
            p["availableDecisions"]
                .as_array()
                .is_none_or(|available| available.contains(&json!(choice)))
        })
        .collect();
    if !choices.contains(&"accept") || !choices.contains(&"decline") {
        return None;
    }
    let mut item = json!({"id":request,"requestId":request,"turnId":p["turnId"],"kind":kind,
        "title":if kind=="question" {"A quick question"} else if method == "vibyra/tool/requestApproval" {"Allow this tool action?"} else if permissions {"Allow additional access?"} else if network {"Allow this network access?"} else if method.contains("fileChange") {"Allow these file changes?"} else {"Allow this command?"},
        "text":p["reason"],"detail":review,"scope":p["cwd"],"status":"pending","actionVersion":version,
        "allowLabel":if permissions {"Allow for this turn"} else {"Allow once"},
        "choices":choices,"questions":questions,"rpcId":rpc,"method":method,"action":p});
    item["persistentAvailable"] = json!(super::policy::rule_key(&item).is_some());
    Some(item)
}
