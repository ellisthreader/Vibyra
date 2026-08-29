//! The journey no unit test can stand in for: a real provider CLI, a real
//! database, two turns, and a resume that lands in the same conversation.
//!
//! Opt-in, because it spends the user's model credits and needs a signed-in
//! CLI. Run it with:
//!
//! ```text
//! VIBYRA_LIVE_ENGINE_TESTS=1 cargo test -p vibyra-core --test live_engines -- --nocapture
//! ```
//!
//! Skipped silently otherwise, so CI and a machine with no account stay green.
//! What it proves is the whole Phase 2/3 contract at once: the adapter builds
//! a command the CLI accepts, the supervisor streams it, the normalizer
//! recognises what comes back, the chat binds to the provider's conversation,
//! and the *second* turn resumes that same conversation rather than starting a
//! new one — which is the single claim the whole feature rests on.

use vibyra_core::agent_chats::{self, transcript, NewChat};
use vibyra_core::agent_model::{Engine, PermissionMode};
use vibyra_core::agent_profiles::{self, NewAgent};
use vibyra_core::agent_runtime::adapter::TurnPlan;
use vibyra_core::agent_runtime::{normalize, run, AgentEvent, TurnExit, TurnHandle};
use vibyra_core::agentdb::AgentDb;

fn enabled() -> bool {
    std::env::var("VIBYRA_LIVE_ENGINE_TESTS").is_ok_and(|value| value == "1")
}

#[test]
fn claude_completes_two_turns_and_resumes_the_same_conversation() {
    if !enabled() {
        eprintln!("skipping: set VIBYRA_LIVE_ENGINE_TESTS=1 to run against the real CLI");
        return;
    }
    journey(Engine::Claude);
}

#[test]
fn codex_completes_two_turns_and_resumes_the_same_conversation() {
    if !enabled() {
        eprintln!("skipping: set VIBYRA_LIVE_ENGINE_TESTS=1 to run against the real CLI");
        return;
    }
    journey(Engine::Codex);
}

fn journey(engine: Engine) {
    let tmp = tempfile::tempdir().unwrap();
    let db = AgentDb::open(&tmp.path().join("agents.db")).unwrap();
    let profile = agent_profiles::create(
        &db,
        "live",
        tmp.path(),
        NewAgent {
            name: "Live".into(),
            brief: "Answer in as few words as possible.".into(),
            engine,
        },
    )
    .unwrap();
    let chat = agent_chats::create(
        &db,
        "live",
        NewChat {
            agent_id: Some(profile.id.clone()),
            engine,
            title: String::new(),
            source: vibyra_core::agent_model::ChatSource::User,
        },
    )
    .unwrap();

    // Turn one: a word the second turn can ask about, so a resume that
    // silently started a fresh conversation is detectable rather than merely
    // plausible.
    let first = turn(
        &db,
        &chat.id,
        engine,
        &profile.home_path,
        "Reply with exactly: banana",
    );
    assert_eq!(
        first,
        TurnExit::Completed,
        "{} failed its first turn",
        engine.as_str()
    );

    let bound = agent_chats::get(&db, "live", &chat.id).unwrap().session_id;
    assert!(
        bound.is_some(),
        "{} never named its conversation, so the chat cannot be resumed",
        engine.as_str()
    );

    let second = turn(
        &db,
        &chat.id,
        engine,
        &profile.home_path,
        "What single word did I ask you to reply with? Answer with just that word.",
    );
    assert_eq!(
        second,
        TurnExit::Completed,
        "{} failed its second turn",
        engine.as_str()
    );

    // The id must not have moved: a chat is one conversation for its whole life.
    assert_eq!(
        agent_chats::get(&db, "live", &chat.id).unwrap().session_id,
        bound,
        "{} started a new conversation instead of resuming",
        engine.as_str()
    );

    let said = transcript::all(&db, &chat.id)
        .unwrap()
        .into_iter()
        .filter_map(|row| match row.event {
            AgentEvent::AssistantCompleted { text } => Some(text.to_lowercase()),
            _ => None,
        })
        .collect::<Vec<_>>();
    assert!(
        said.iter().rev().take(2).any(|text| text.contains("banana")),
        "{} did not remember the first turn — the resume did not carry the conversation. Said: {said:?}",
        engine.as_str()
    );
}

fn turn(db: &AgentDb, chat_id: &str, engine: Engine, cwd: &str, prompt: &str) -> TurnExit {
    let chat = agent_chats::get(db, "live", chat_id).unwrap();
    let turn_id = vibyra_core::agentdb::ids::new_id();
    let planned = TurnPlan {
        engine,
        session: chat.session_id.clone(),
        permission: PermissionMode::Plan,
        cwd: cwd.to_string(),
        places: Vec::new(),
        model: None,
        effort: None,
        images: Vec::new(),
        prompt: prompt.to_string(),
        system_prompt: None,
        env: Vec::new(),
        env_remove: Vec::new(),
    }
    .build();

    if let Some(session) = planned.session.as_deref() {
        agent_chats::bind_session(db, chat_id, session).unwrap();
    }

    let handle = TurnHandle::new();
    run(planned.command, &handle, |line| {
        for event in normalize(engine, line) {
            if let AgentEvent::SessionIdentified { session_id } = &event {
                let _ = agent_chats::bind_session(db, chat_id, session_id);
            }
            let _ = transcript::append(db, chat_id, &turn_id, event);
        }
    })
    .unwrap()
}
