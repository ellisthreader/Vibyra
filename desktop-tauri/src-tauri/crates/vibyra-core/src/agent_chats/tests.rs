use super::*;
use crate::agent_model::{ChatSource, Engine};
use crate::agent_runtime::AgentEvent;
use crate::agentdb::AgentDb;

fn seeded() -> (AgentDb, String) {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_profiles \
                 (id, account, name, engine, home_path, created_ms, updated_ms) \
                 VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 1, 1)",
                [],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();
    (db, "a".into())
}

fn open(db: &AgentDb, agent: Option<&str>) -> AgentChat {
    create(
        db,
        "acct",
        NewChat {
            agent_id: agent.map(str::to_string),
            engine: Engine::Claude,
            title: String::new(),
            source: ChatSource::User,
        },
    )
    .unwrap()
}

/// The core promise of the roster: one agent owns many chats, and opening a
/// new one never disturbs another. This is why the UI can offer New Chat
/// instead of asking a user to clear the conversation they are in.
#[test]
fn a_second_chat_leaves_the_first_untouched() {
    let (db, agent) = seeded();
    let first = open(&db, Some(&agent));
    transcript::append(
        &db,
        &first.id,
        "t1",
        AgentEvent::AssistantCompleted { text: "one".into() },
    )
    .unwrap();
    bind_session(&db, &first.id, "sess-first").unwrap();

    let second = open(&db, Some(&agent));
    transcript::append(
        &db,
        &second.id,
        "t1",
        AgentEvent::AssistantCompleted { text: "two".into() },
    )
    .unwrap();

    assert_eq!(transcript::count(&db, &first.id).unwrap(), 1);
    assert_eq!(
        get(&db, "acct", &first.id).unwrap().session_id.as_deref(),
        Some("sess-first")
    );
    assert_eq!(get(&db, "acct", &second.id).unwrap().session_id, None);
    assert_eq!(list(&db, "acct", Some(&agent)).unwrap().len(), 2);
}

/// Events come back in the order they were written, whatever the clock did.
#[test]
fn the_transcript_reads_back_in_sequence() {
    let (db, agent) = seeded();
    let chat = open(&db, Some(&agent));
    for index in 0..5 {
        transcript::append(
            &db,
            &chat.id,
            "t1",
            AgentEvent::AssistantCompleted {
                text: format!("line {index}"),
            },
        )
        .unwrap();
    }
    let rows = transcript::recent(&db, &chat.id).unwrap();
    assert_eq!(
        rows.iter().map(|row| row.seq).collect::<Vec<_>>(),
        [0, 1, 2, 3, 4]
    );
    assert!(matches!(&rows[0].event, AgentEvent::AssistantCompleted { text } if text == "line 0"));
}

/// Deltas are streamed and not stored; the completion that follows carries the
/// same text in one row, so a reload looks like what was on screen.
#[test]
fn streaming_deltas_never_reach_the_transcript() {
    let (db, agent) = seeded();
    let chat = open(&db, Some(&agent));
    transcript::append(
        &db,
        &chat.id,
        "t1",
        AgentEvent::AssistantDelta { text: "par".into() },
    )
    .unwrap();
    transcript::append(
        &db,
        &chat.id,
        "t1",
        AgentEvent::AssistantDelta {
            text: "tial".into(),
        },
    )
    .unwrap();
    let row = transcript::append(
        &db,
        &chat.id,
        "t1",
        AgentEvent::AssistantCompleted {
            text: "partial".into(),
        },
    )
    .unwrap();

    assert_eq!(transcript::count(&db, &chat.id).unwrap(), 1);
    assert_eq!(row.seq, 0, "the completion takes the first stored slot");
}

/// A chat is one conversation for its whole life. Once bound, its session id
/// is never quietly repointed at a different one.
#[test]
fn a_bound_session_is_never_rewritten() {
    let (db, agent) = seeded();
    let chat = open(&db, Some(&agent));
    bind_session(&db, &chat.id, "first").unwrap();
    bind_session(&db, &chat.id, "second").unwrap();
    assert_eq!(
        get(&db, "acct", &chat.id).unwrap().session_id.as_deref(),
        Some("first")
    );
}

/// No process survives a restart, so a chat left marked running is a crash's
/// leftover — cleared on load rather than spinning forever.
#[test]
fn a_chat_left_running_by_a_crash_is_reset_on_load() {
    let (db, agent) = seeded();
    let chat = open(&db, Some(&agent));
    set_state(&db, &chat.id, "running").unwrap();

    assert_eq!(reset_running(&db).unwrap(), 1);
    assert_eq!(get(&db, "acct", &chat.id).unwrap().state, "idle");
}
