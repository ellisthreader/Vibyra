use serde_json::{json, Value};
use sha2::{Digest, Sha256};
#[cfg(test)]
pub(crate) fn pending(method: &str, rpc: &Value, p: &Value, detail: &str) -> Option<Value> {
    pending_observed(method, rpc, p, detail, None)
}

pub(crate) fn pending_observed(
    method: &str,
    rpc: &Value,
    p: &Value,
    detail: &str,
    observed_command: Option<&str>,
) -> Option<Value> {
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
    let extra_network = additional_network(&p["additionalPermissions"])?;
    // Input for a command already running is a one-off decision, never a saved rule.
    let stdin = p["kind"] == "writeStdin";
    let command = p["command"]
        .as_str()
        .filter(|text| !text.is_empty())
        .or(observed_command);
    if method == "item/commandExecution/requestApproval"
        && ((!network && command.is_none_or(str::is_empty))
            || p["kind"]
                .as_str()
                .is_some_and(|kind| kind != "command" && kind != "writeStdin"))
    {
        return None;
    }
    if extra_network && (method != "item/commandExecution/requestApproval" || network) {
        return None;
    }
    let budget = if kind == "question" { 7000 } else { 256 * 1024 };
    if p.to_string().len() + detail.len() > budget {
        return None;
    }
    let tool = tool_request(method, p);
    let review = if let Some((_, shown)) = &tool {
        shown.clone()
    } else if network || permissions {
        serde_json::to_string_pretty(p).ok()?
    } else if method.contains("fileChange") {
        detail.to_owned()
    } else {
        command.unwrap_or(detail).to_owned()
    };
    let review = if extra_network {
        format!("{review}\n\nRequested access: network access to all destinations for this command")
    } else {
        review
    };
    let review = if let Some(environment) = p["environmentId"].as_str() {
        format!("Environment: {environment}\n{review}")
    } else {
        review
    };
    if extra_network && review.len() > 6000 {
        return None;
    }
    let rule = (method == "item/commandExecution/requestApproval" && !stdin)
        .then(|| super::provider_decision::command_rule(p))
        .flatten();
    let request = uuid::Uuid::new_v4().to_string();
    let version = format!(
        "{:x}",
        Sha256::digest(format!("{method}:{rpc}:{p}:{detail}"))
    );
    let mut choices: Vec<_> = ["decline", "accept", "acceptForSession"]
        .into_iter()
        .filter(|choice| !(stdin && *choice == "acceptForSession"))
        .filter(|choice| !(extra_network && *choice == "acceptForSession"))
        .filter(|choice| {
            p["availableDecisions"]
                .as_array()
                .is_none_or(|available| available.contains(&json!(choice)))
        })
        .collect();
    if rule.is_some() {
        choices.push("acceptWithExecpolicyAmendment");
    }
    if !choices.contains(&"accept") || !choices.contains(&"decline") {
        return None;
    }
    let mut item = json!({"id":request,"requestId":request,"turnId":p["turnId"],"kind":kind,
        "title":if kind=="question" {"A quick question"} else if let Some((title, _)) = &tool {*title} else if permissions {"Allow additional access?"} else if network {"Allow this network access?"} else if stdin {"Allow input to a running command?"} else if method.contains("fileChange") {"Allow these file changes?"} else {"Allow this command?"},
        "text":p["reason"],"detail":review,"scope":p["cwd"],"status":"pending","actionVersion":version,
        "allowLabel":if permissions {"Allow for this turn"} else {"Allow once"},
        "choices":choices,"questions":questions,"rpcId":rpc,"method":method,"action":p});
    item["persistentAvailable"] = json!(super::policy::rule_key(&item).is_some());
    if let Some((_, summary)) = rule {
        item["ruleSummary"] = json!(summary);
    }
    Some(item)
}

/// The generated Codex 0.157 profile has `network` and `fileSystem`. Permit
/// only the one-command network overlay we can describe exactly on a phone.
fn additional_network(profile: &Value) -> Option<bool> {
    if profile.is_null() {
        return Some(false);
    }
    let object = profile.as_object()?;
    if object
        .keys()
        .any(|key| key != "network" && key != "fileSystem")
        || !profile["fileSystem"].is_null()
    {
        return None;
    }
    let network = profile.get("network")?.as_object()?;
    if network.len() != 1 || network.get("enabled") != Some(&json!(true)) {
        return None;
    }
    Some(true)
}

/// A Claude or Gemini tool approval says what it allows, and shows the thing
/// itself: the command, the file and its change, the address. Other tools show
/// their (redacted) input.
fn tool_request(method: &str, p: &Value) -> Option<(&'static str, String)> {
    if method != "vibyra/tool/requestApproval" {
        return None;
    }
    let input = &p["input"];
    let text = |key: &str| input[key].as_str().filter(|s| !s.is_empty());
    if let Some(command) = text("command") {
        return Some(("Allow this command?", command.to_owned()));
    }
    if let Some(path) = text("file_path").or(text("notebook_path")) {
        let mut shown = path.to_owned();
        for (sign, key) in [("-", "old_string"), ("+", "new_string"), ("+", "content")] {
            if let Some(body) = text(key) {
                shown.push('\n');
                shown.push_str(
                    &body
                        .lines()
                        .map(|line| format!("{sign}{line}"))
                        .collect::<Vec<_>>()
                        .join("\n"),
                );
            }
        }
        return Some(("Allow this file change?", shown));
    }
    if let Some(url) = text("url") {
        return Some(("Allow this web request?", url.to_owned()));
    }
    let shown = serde_json::to_string_pretty(&super::observed::redact(input)).ok()?;
    Some(("Allow this tool action?", shown))
}
