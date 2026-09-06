use super::*;
use crate::{
    agent_chats,
    agent_model::{ChatSource, Engine, PermissionMode},
    agentdb::AgentDb,
};

fn fixture() -> (AgentDb, String, RunSpec) {
    let db = AgentDb::open_memory().unwrap();
    let chat = agent_chats::create(
        &db,
        "owner",
        agent_chats::NewChat {
            agent_id: None,
            engine: Engine::Claude,
            title: "Task".into(),
            source: ChatSource::User,
        },
    )
    .unwrap();
    let spec = RunSpec {
        agent_name: "Reviewer".into(),
        engine: Engine::Claude,
        model: Some("chosen".into()),
        effort: None,
        account_id: None,
        permission: PermissionMode::Plan,
        cwd: "/workspace".into(),
        places: vec![],
        prompt: "Review".into(),
        context: "Source evidence".into(),
        context_fingerprint: "digest".into(),
        provider_version: "test".into(),
        timeout_ms: 1000,
        max_tool_calls: 5,
    };
    (db, chat.id, spec)
}

#[test]
fn task_authority_is_persisted_and_scoped_to_its_owner() {
    let (db, chat, spec) = fixture();
    begin(&db, "run", "owner", &chat, None, spec).unwrap();
    let run = get(&db, "owner", "run").unwrap();
    assert_eq!(run.spec.permission, PermissionMode::Plan);
    assert_eq!(run.spec.model.as_deref(), Some("chosen"));
    assert!(get(&db, "someone-else", "run").is_err());
}

#[test]
fn admission_refuses_duplicates_and_foreign_chat_ownership() {
    let (db, chat, spec) = fixture();
    assert!(begin(&db, "foreign", "other", &chat, None, spec.clone()).is_err());
    begin(&db, "run", "owner", &chat, None, spec.clone()).unwrap();
    assert!(begin(&db, "duplicate", "owner", &chat, None, spec.clone()).is_err());
    finish(
        &db,
        "owner",
        "run",
        &RunOutcome {
            status: RunStatus::Cancelled,
            message: Some("Stopped".into()),
        },
    )
    .unwrap();
    begin(&db, "next", "owner", &chat, None, spec).unwrap();
    assert_eq!(
        get(&db, "owner", "run").unwrap().status,
        RunStatus::Cancelled
    );
}

#[test]
fn recovery_marks_interrupted_tasks_without_replaying_effects() {
    let (db, chat, spec) = fixture();
    begin(&db, "run", "owner", &chat, None, spec).unwrap();
    set_waiting(&db, "owner", "run", true).unwrap();
    recover(&db).unwrap();
    let run = get(&db, "owner", "run").unwrap();
    assert_eq!(run.status, RunStatus::Interrupted);
    assert!(run.ended_ms.is_some());
    assert_eq!(
        agent_chats::get(&db, "owner", &chat).unwrap().state,
        "failed"
    );
}

#[test]
fn failed_and_cancelled_processes_never_become_successful_tasks() {
    use crate::agent_runtime::TurnExit;
    for exit in [
        TurnExit::Cancelled,
        TurnExit::Failed("provider failed".into()),
    ] {
        let result = RunOutcome::from_exit(Ok(exit));
        assert_ne!(result.status, RunStatus::Succeeded);
        assert!(result.message.is_some());
    }
}

#[test]
fn artifacts_belong_to_the_recorded_run_and_account() {
    let (db, chat, spec) = fixture();
    begin(&db, "run", "owner", &chat, None, spec).unwrap();
    save_artifact(
        &db,
        "owner",
        "run",
        "report",
        "Findings",
        "Recorded evidence",
    )
    .unwrap();
    assert_eq!(
        artifact_list(&db, "owner", "run").unwrap()[0].content,
        "Recorded evidence"
    );
    assert!(artifact_list(&db, "other", "run").is_err());
}
