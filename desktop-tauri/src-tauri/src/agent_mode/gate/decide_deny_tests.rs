//! What the gate refuses before anyone is asked.

use std::time::Duration;

use serde_json::json;
use vibyra_core::agent_model::{Engine, PermissionMode};

use super::decide::answer;
use super::decide_tests::world;
use crate::agent_mode::bridge::wire::BridgeRequest;

/// A chat that may not write is refused a write outright. Before this the
/// gate raised a card, and one Approve allowed a path no grant covered —
/// so a chat with *no* folder could reach more than a chat with one.
#[test]
fn a_read_only_subject_is_refused_a_write_without_a_card() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat_id) = world(&tmp);
    let agent_id = vibyra_core::agent_chats::get(&world.db, &world.account, &chat_id)
        .unwrap()
        .agent_id
        .unwrap();
    vibyra_core::agent_profiles::update(
        &world.db,
        &world.account,
        &agent_id,
        vibyra_core::agent_profiles::AgentUpdate {
            permission: Some(PermissionMode::Plan),
            ..Default::default()
        },
    )
    .unwrap();

    let reply = answer(
        &world,
        "tok",
        BridgeRequest {
            token: "tok".into(),
            chat_id: chat_id.clone(),
            turn_id: "t".into(),
            tool_name: "Write".into(),
            input: json!({ "file_path": "/etc/passwd", "content": "x" }),
        },
        &|_| panic!("no card may be raised for a refused write"),
        Duration::from_millis(10),
    );
    assert_eq!(reply.behavior, "deny");
    assert!(vibyra_core::approvals::pending(&world.db, &world.account)
        .unwrap()
        .is_empty());
}

/// Chat Mode with nothing mounted is the same case: no grant, no write.
#[test]
fn a_detached_chat_with_no_folder_cannot_write() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, _) = world(&tmp);
    let chat = vibyra_core::agent_chats::create(
        &world.db,
        &world.account,
        vibyra_core::agent_chats::NewChat {
            agent_id: None,
            engine: Engine::Claude,
            title: String::new(),
            source: vibyra_core::agent_model::ChatSource::User,
        },
    )
    .unwrap();
    world.begin(&chat.id);
    let reply = answer(
        &world,
        "tok",
        BridgeRequest {
            token: "tok".into(),
            chat_id: chat.id,
            turn_id: "t".into(),
            tool_name: "Write".into(),
            input: json!({ "file_path": "/home/u/.ssh/authorized_keys", "content": "x" }),
        },
        &|_| panic!("no card may be raised for a refused write"),
        Duration::from_millis(10),
    );
    assert_eq!(reply.behavior, "deny");
}

/// A wrong token is refused before the chat is even looked up.
#[test]
fn a_wrong_token_is_refused() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat_id) = world(&tmp);
    let reply = answer(
        &world,
        "tok",
        BridgeRequest {
            token: "tol".into(),
            chat_id,
            turn_id: "t".into(),
            tool_name: "Read".into(),
            input: json!({ "file_path": "/x" }),
        },
        &|_| panic!("no card"),
        Duration::from_millis(10),
    );
    assert_eq!(reply.behavior, "deny");
}
