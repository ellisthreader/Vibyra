//! The gate, end to end inside one process: a real world in a temp folder, a
//! stand-in for the app's emitter, and the person's answer arriving from
//! another thread.

use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde_json::json;
use vibyra_core::agent_model::{Engine, PermissionMode};
use vibyra_core::approvals::ApprovalRequest;

use super::decide::answer;
use super::waiters;
use crate::agent_mode::bridge::wire::BridgeRequest;
use crate::agent_mode::hub::{AgentHub, AgentWorld};

pub(super) fn world(tmp: &tempfile::TempDir) -> (Arc<AgentWorld>, String) {
    let hub = AgentHub::default();
    let world = hub.world("acct", tmp.path()).unwrap();
    let profile = vibyra_core::agent_profiles::create(
        &world.db,
        &world.account,
        &world.root,
        vibyra_core::agent_profiles::NewAgent {
            name: "Nia".into(),
            brief: String::new(),
            engine: Engine::Claude,
        },
    )
    .unwrap();
    // A teammate is created at the safe default; these cases are about what an
    // agent that *may* write proposes, so it is widened here rather than in
    // the fixture, where it would read as the default.
    let profile = vibyra_core::agent_profiles::update(
        &world.db,
        &world.account,
        &profile.id,
        vibyra_core::agent_profiles::AgentUpdate {
            permission: Some(PermissionMode::Standard),
            ..Default::default()
        },
    )
    .unwrap();
    let chat = vibyra_core::agent_chats::create(
        &world.db,
        &world.account,
        vibyra_core::agent_chats::NewChat {
            agent_id: Some(profile.id.clone()),
            engine: Engine::Claude,
            title: String::new(),
            source: vibyra_core::agent_model::ChatSource::User,
        },
    )
    .unwrap();
    // A question only ever arrives while its turn is running, and the gate
    // relies on that: a card whose turn has already gone is abandoned rather
    // than left parking a provider process. Registering the handle is what
    // makes this fixture the situation the gate is actually asked about.
    world.begin(&chat.id);
    (world, chat.id)
}

fn ask(chat_id: &str, tool: &str, input: serde_json::Value) -> BridgeRequest {
    BridgeRequest {
        token: "tok".into(),
        chat_id: chat_id.into(),
        turn_id: "turn".into(),
        tool_name: tool.into(),
        input,
    }
}

fn quiet(_: &ApprovalRequest) {}

#[test]
fn a_wrong_token_is_refused_before_anything_is_read() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let mut request = ask(&chat, "Bash", json!({"command": "ls"}));
    request.token = "forged".into();
    let reply = answer(&world, "tok", request, &quiet, Duration::from_millis(10));
    assert_eq!(reply.behavior, "deny");
}

/// A read never raises a card, and the input comes back untouched so Claude
/// runs exactly what it proposed.
#[test]
fn reads_are_allowed_without_a_card() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let input = json!({"command": "git status"});
    let reply = answer(
        &world,
        "tok",
        ask(&chat, "Bash", input.clone()),
        &quiet,
        Duration::ZERO,
    );
    assert_eq!(reply.behavior, "allow");
    assert_eq!(reply.updated_input, Some(input));
    assert!(vibyra_core::approvals::pending(&world.db, &world.account)
        .unwrap()
        .is_empty());
}

#[test]
fn a_write_outside_every_grant_is_refused_without_a_card() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let outside = tmp.path().join("elsewhere").join("x.txt");
    let reply = answer(
        &world,
        "tok",
        ask(
            &chat,
            "Write",
            json!({"file_path": outside, "content": "x"}),
        ),
        &quiet,
        Duration::ZERO,
    );
    assert_eq!(reply.behavior, "deny");
    assert!(reply.message.unwrap().contains("outside every place"));
    assert!(vibyra_core::approvals::pending(&world.db, &world.account)
        .unwrap()
        .is_empty());
}

/// The card is raised, the wait blocks, and the person's answer — given on
/// another thread through the same path the UI uses — ends it.
#[test]
fn a_publish_raises_a_card_and_waits_for_the_answer() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let raised: Arc<Mutex<Option<ApprovalRequest>>> = Arc::new(Mutex::new(None));
    let seen = Arc::clone(&raised);
    let answering_world = Arc::clone(&world);
    let raise = move |card: &ApprovalRequest| {
        *seen.lock().unwrap() = Some(card.clone());
        let card = card.clone();
        let world = Arc::clone(&answering_world);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(60));
            let record = vibyra_core::approvals::resolve(
                &world.db,
                &world.account,
                &card.id,
                true,
                Some(&card.fingerprint),
            )
            .unwrap();
            waiters::notify(&record.id, record.state == "approved");
        });
    };
    let input = json!({"command": "git push origin main"});
    let reply = answer(
        &world,
        "tok",
        ask(&chat, "Bash", input.clone()),
        &raise,
        Duration::from_secs(5),
    );
    let card = raised.lock().unwrap().clone().expect("a card was raised");
    assert_eq!(card.action, "shell.run");
    assert_eq!(card.detail, "git push origin main");
    assert_eq!(card.agent_name, "Nia");
    assert_eq!(reply.behavior, "allow");
    assert_eq!(reply.updated_input, Some(input));
}

#[test]
fn nobody_answering_ends_in_a_deny_and_an_invalidated_card() {
    let tmp = tempfile::tempdir().unwrap();
    let (world, chat) = world(&tmp);
    let reply = answer(
        &world,
        "tok",
        ask(&chat, "Bash", json!({"command": "rm -rf build"})),
        &quiet,
        Duration::from_millis(20),
    );
    assert_eq!(reply.behavior, "deny");
    assert!(reply.message.unwrap().contains("Nobody answered"));
    assert!(vibyra_core::approvals::pending(&world.db, &world.account)
        .unwrap()
        .is_empty());
}
