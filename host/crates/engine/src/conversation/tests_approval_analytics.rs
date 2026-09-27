use super::{requests, stream, tests::setup};
use serde_json::json;

#[test]
fn input_to_a_running_command_is_a_one_off_card() {
    let item = requests::pending(
        "item/commandExecution/requestApproval",
        &json!(1),
        &json!({"threadId":"thread","turnId":"turn","kind":"writeStdin","command":"npm init","cwd":"/p"}),
        "",
    )
    .unwrap();
    assert_eq!(item["title"], "Allow input to a running command?");
    assert_eq!(item["choices"], json!(["decline", "accept"]));
    assert_eq!(item["persistentAvailable"], false);
}
#[test]
fn codex_local_network_command_can_be_reviewed_on_the_phone() {
    let (_dir, engine, _) = setup();
    let command = "HKE_LOCAL_HOST=192.168.1.118 HKE_ALLOW_LAN=1 npm run start:website";
    stream::receive(
        &engine.shared,
        "session",
        json!({"method":"item/started",
        "params":{"threadId":"thread","turnId":"turn","item":{"id":"command","type":"commandExecution",
            "status":"inProgress","command":command,"cwd":"/project"}}}),
    );
    stream::receive(
        &engine.shared,
        "session",
        json!({"id":70,"method":"item/commandExecution/requestApproval",
        "params":{"threadId":"thread","turnId":"turn","itemId":"command","kind":"command",
            "environmentId":"local","cwd":"/project","reason":"Let the phone open this site",
            "additionalPermissions":{"network":{"enabled":true},"fileSystem":null},
            "availableDecisions":["accept",{"acceptWithExecpolicyAmendment":{"execpolicy_amendment":["npm","run"]}},"decline"]}}),
    );
    let state = engine.shared.lock();
    let card = state.conversations["session"].items.last().unwrap();
    assert_eq!(card["kind"], "permission");
    assert_eq!(card["status"], "pending");
    assert_eq!(card["title"], "Allow this command?");
    assert!(card["detail"].as_str().unwrap().contains(command));
    assert!(card["detail"]
        .as_str()
        .unwrap()
        .contains("all destinations"));
    assert_eq!(
        card["choices"],
        json!(["decline", "accept", "acceptWithExecpolicyAmendment"])
    );
    assert!(card["ruleSummary"]
        .as_str()
        .unwrap()
        .contains("[\"npm\",\"run\"]"));
    assert_eq!(card["persistentAvailable"], false);
    assert!(card["action"]["command"].is_null());
    drop(state);
    let snapshot = engine
        .handle(
            "phone",
            "conversation.snapshot",
            json!({"sessionId":"session"}),
        )
        .unwrap();
    assert_eq!(snapshot["pending"][0]["status"], "pending");
    assert!(snapshot["pending"][0]["detail"]
        .as_str()
        .unwrap()
        .contains("Environment: local"));
    assert!(snapshot["pending"][0]["ruleSummary"]
        .as_str()
        .unwrap()
        .contains("Future matching commands"));
}

#[test]
fn unknown_extra_access_stays_unapprovable() {
    let request = json!({"command":"npm run start:website", "additionalPermissions":{
        "network":{"enabled":true},"fileSystem":{"write":["/private"]}}});
    assert!(requests::pending(
        "item/commandExecution/requestApproval",
        &json!(1),
        &request,
        ""
    )
    .is_none());
}
#[test]
fn codex_rule_is_only_offered_when_its_proposal_matches_the_available_decision() {
    let p = json!({"command":"npm run build","cwd":"/project",
        "proposedExecpolicyAmendment":["npm","run"],
        "availableDecisions":["accept","decline",{"acceptWithExecpolicyAmendment":{
            "execpolicy_amendment":["npm","run"]}}]});
    let allowed =
        requests::pending("item/commandExecution/requestApproval", &json!(2), &p, "").unwrap();
    assert!(allowed["choices"]
        .as_array()
        .unwrap()
        .contains(&json!("acceptWithExecpolicyAmendment")));
    let mut changed = p.clone();
    changed["proposedExecpolicyAmendment"] = json!(["curl"]);
    let refused = requests::pending(
        "item/commandExecution/requestApproval",
        &json!(3),
        &changed,
        "",
    )
    .unwrap();
    assert!(!refused["choices"]
        .as_array()
        .unwrap()
        .contains(&json!("acceptWithExecpolicyAmendment")));
    assert!(refused["ruleSummary"].is_null());
}
#[test]
fn a_claude_approval_shows_what_it_allows() {
    let command = requests::pending(
        "vibyra/tool/requestApproval",
        &json!(1),
        &json!({"turnId":"turn","tool":"Bash","input":{"command":"npm install","description":"Install dependencies"},
            "reason":"Install dependencies","cwd":"/p","availableDecisions":["accept","decline"]}),
        "",
    )
    .unwrap();
    assert_eq!(command["title"], "Allow this command?");
    assert_eq!(command["detail"], "npm install");
    let edit = requests::pending(
        "vibyra/tool/requestApproval",
        &json!(2),
        &json!({"turnId":"turn","tool":"Edit","input":{"file_path":"/p/a.txt","old_string":"two","new_string":"2"},
            "cwd":"/p","availableDecisions":["accept","decline"]}),
        "",
    )
    .unwrap();
    assert_eq!(edit["title"], "Allow this file change?");
    assert_eq!(edit["detail"], "/p/a.txt\n-two\n+2");
}
