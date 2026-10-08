use super::handler;
use crate::agent_v2_browser::policy::Policy;
use crate::agent_v2_browser::session::Shared;
use serde_json::{json, Value};
use std::sync::Arc;

fn attach(kind: &str, waiting: bool) -> Value {
    json!({"method": "Target.attachedToTarget", "params": {"sessionId": "child", "waitingForDebugger": waiting,
        "targetInfo": {"targetId": "t1", "type": kind, "url": "about:srcdoc"}}})
}

fn sent(kind: &str, waiting: bool) -> (Vec<String>, bool) {
    let (policy, shared) = (Arc::new(Policy::new(&[])), Arc::new(Shared::default()));
    let mut on = handler(policy, shared.clone());
    let mut commands = Vec::new();
    on(&attach(kind, waiting), &mut |method, _, _| {
        commands.push(method.to_owned())
    });
    (commands, shared.live_socket())
}

#[test]
fn a_frame_held_for_us_gets_the_guard_before_it_runs() {
    let (commands, tainted) = sent("iframe", true);
    assert!(!tainted);
    let guard = commands
        .iter()
        .position(|c| c == "Page.addScriptToEvaluateOnNewDocument")
        .unwrap();
    let resume = commands
        .iter()
        .position(|c| c == "Runtime.runIfWaitingForDebugger")
        .unwrap();
    assert!(guard < resume, "{commands:?}");
}

#[test]
fn a_frame_that_already_ran_cannot_be_vouched_for() {
    let (commands, tainted) = sent("iframe", false);
    assert!(
        tainted,
        "it may hold a socket the guard never saw, so input is refused"
    );
    assert!(commands.contains(&"Page.addScriptToEvaluateOnNewDocument".to_owned()));
}

#[test]
fn workers_get_the_guard_evaluated_before_they_resume() {
    for kind in ["worker", "shared_worker", "service_worker"] {
        let (commands, tainted) = sent(kind, true);
        assert!(!tainted);
        let guard = commands
            .iter()
            .position(|c| c == "Runtime.evaluate")
            .unwrap();
        let resume = commands
            .iter()
            .position(|c| c == "Runtime.runIfWaitingForDebugger")
            .unwrap();
        assert!(guard < resume, "{kind}: {commands:?}");
    }
}
