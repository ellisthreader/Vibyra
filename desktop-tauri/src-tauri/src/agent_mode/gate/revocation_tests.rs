use super::{decide::answer, test_world::world, waiters};
use crate::agent_mode::bridge::wire::BridgeRequest;
use serde_json::json;
use std::time::Duration;
use vibyra_core::{agent_model::PermissionMode, agent_profiles::AgentUpdate};

fn request(chat: &str, tool: &str, input: serde_json::Value) -> BridgeRequest {
    BridgeRequest {
        token: "tok".into(),
        chat_id: chat.into(),
        turn_id: format!("turn-{chat}"),
        tool_name: tool.into(),
        tool_use_id: Some("call-1".into()),
        input,
    }
}

#[test]
fn a_real_active_run_can_read_its_home_but_not_an_ungranted_file() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let run =
        vibyra_core::agent_runs::get(&world.db, &world.account, &format!("turn-{chat}")).unwrap();
    let granted = std::path::Path::new(&run.spec.cwd).join("notes.txt");
    let outside = tmp.path().join("private.txt");
    std::fs::write(&granted, "task input").unwrap();
    std::fs::write(&outside, "not granted").unwrap();
    for (path, expected) in [(granted, "allow"), (outside, "deny")] {
        let reply = answer(
            &world,
            "tok",
            request(&chat, "Read", json!({"file_path":path})),
            &|_| panic!("no decision"),
            Duration::ZERO,
        );
        assert_eq!(reply.behavior, expected);
    }
}

#[test]
fn an_effectful_request_without_identity_is_denied_before_approval() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let mut req = request(&chat, "Bash", json!({"command":"git push origin main"}));
    req.tool_use_id = None;
    let reply = answer(
        &world,
        "tok",
        req,
        &|_| panic!("no decision"),
        Duration::ZERO,
    );
    assert_eq!(reply.behavior, "deny");
    assert!(reply.message.unwrap().contains("identity"));
}

#[test]
fn an_approval_cannot_override_a_permission_revoked_while_waiting() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let agent = vibyra_core::agent_chats::get(&world.db, &world.account, &chat)
        .unwrap()
        .agent_id
        .unwrap();
    let raise = |card: &vibyra_core::approvals::ApprovalRequest| {
        vibyra_core::agent_profiles::update(
            &world.db,
            &world.account,
            &agent,
            AgentUpdate {
                permission: Some(PermissionMode::Plan),
                ..Default::default()
            },
        )
        .unwrap();
        let approved = vibyra_core::approvals::resolve(
            &world.db,
            &world.account,
            &card.id,
            true,
            Some(&card.fingerprint),
        )
        .unwrap();
        waiters::notify(&approved.id, true);
    };
    let reply = answer(
        &world,
        "tok",
        request(&chat, "Bash", json!({"command":"git push origin main"})),
        &raise,
        Duration::from_secs(1),
    );
    assert_eq!(reply.behavior, "deny");
    assert!(reply.message.unwrap().contains("read-only"));
}
