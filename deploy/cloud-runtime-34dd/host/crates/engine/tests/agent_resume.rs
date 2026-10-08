//! A Host restart no longer ends a Claude or Codex conversation: the session
//! keeps its agent id in the journal and `session.resume` reopens it in the
//! same record. Fake `claude`/`codex` scripts on PATH record how they ran.
#![cfg(unix)]
mod support;
use serde_json::json;
use support::agents::{args, create, home, only_session, resume, rig};
use support::wait;
use uuid::Uuid;

#[test]
fn claude_is_pinned_then_survives_a_restart_and_resumes_in_the_same_session() {
    let rig = rig();
    let engine = rig.engine("state");
    let created = create(&engine, "claude");
    assert_eq!(created["canResume"], false);
    let launched = args(&rig, "claude.args", 1);
    let words: Vec<&str> = launched[0].split(' ').collect();
    let id = words[words.iter().position(|w| *w == "--session-id").unwrap() + 1];
    assert!(Uuid::parse_str(id).is_ok());
    wait(|| {
        home()
            .join(format!(".claude/projects/-fake/{id}.jsonl"))
            .exists()
    });
    let restarted = rig.restart(engine, |_| {});
    let before = only_session(&restarted);
    assert_eq!(
        (before["status"].as_str(), before["canResume"].as_bool()),
        (Some("interrupted"), Some(true))
    );
    let resumed = resume(&restarted, &before).unwrap();
    for key in ["id", "projectId", "title", "kind", "createdAt"] {
        assert_eq!(resumed[key], created[key], "{key}");
    }
    assert_eq!(
        (resumed["status"].as_str(), resumed["canResume"].as_bool()),
        (Some("running"), Some(false))
    );
    let all = args(&rig, "claude.args", 2);
    assert_eq!(all.len(), 2);
    assert!(all[1].contains(&format!("--resume {id}")) && !all[1].contains("--session-id"));
    assert_eq!(only_session(&restarted)["id"], created["id"]);
    // A second tap while it runs is a plain error, and starts nothing.
    assert!(!resume(&restarted, &resumed)
        .unwrap_err()
        .starts_with("resume_unavailable"));
    let snapshot = restarted
        .handle(
            "phone",
            "session.snapshot",
            json!({"sessionId":created["id"]}),
        )
        .unwrap();
    assert_eq!(snapshot["status"], "running");
    restarted
        .handle("phone", "session.stop", json!({"sessionId":created["id"]}))
        .unwrap();
}

#[test]
fn a_transcript_that_vanishes_turns_resume_into_a_typed_refusal() {
    let rig = rig();
    let engine = rig.engine("state");
    let created = create(&engine, "claude");
    let id = created["id"].as_str().unwrap().to_owned();
    let first = args(&rig, "claude.args", 1)[0].clone();
    let agent = first
        .split(' ')
        .skip_while(|w| *w != "--session-id")
        .nth(1)
        .unwrap()
        .to_owned();
    let file = home().join(format!(".claude/projects/-fake/{agent}.jsonl"));
    wait(|| file.exists());
    let restarted = rig.restart(engine, |_| {});
    assert_eq!(only_session(&restarted)["canResume"], true);
    std::fs::remove_file(&file).unwrap();
    let error = resume(&restarted, &json!({"id":id})).unwrap_err();
    assert!(error.starts_with("resume_unavailable: "), "{error}");
    assert_eq!(only_session(&restarted)["status"], "interrupted");
    assert_eq!(
        args(&rig, "claude.args", 1).len(),
        1,
        "nothing was launched"
    );
}

#[test]
fn codex_resumes_by_its_rollout_id_with_the_verb_first() {
    let rig = rig();
    let engine = rig.engine("state");
    let created = create(&engine, "codex");
    assert!(!args(&rig, "codex.args", 1)[0].contains("resume"));
    let agent = Uuid::new_v4().to_string();
    let day = home().join(".codex/sessions/2026/10/02");
    std::fs::create_dir_all(&day).unwrap();
    std::fs::write(
        day.join(format!("rollout-2026-10-02T09-30-00-{agent}.jsonl")),
        "{}\n",
    )
    .unwrap();
    let sid = created["id"].as_str().unwrap().to_owned();
    // Linux finds this id from /proc; here the journal is given what it would hold.
    let restarted = rig.restart(engine, |db| {
        db.execute(
            "UPDATE sessions SET agent_session_id = ?1 WHERE id = ?2",
            [&agent, &sid],
        )
        .unwrap();
    });
    assert_eq!(only_session(&restarted)["canResume"], true);
    let resumed = resume(&restarted, &created).unwrap();
    assert_eq!(resumed["status"], "running");
    assert_eq!(resumed["title"], "Fix the build");
    let all = args(&rig, "codex.args", 2);
    assert!(
        all[1].starts_with(&format!("resume {agent} --sandbox workspace-write")),
        "{}",
        all[1]
    );
    restarted
        .handle("phone", "session.stop", json!({"sessionId":created["id"]}))
        .unwrap();
}

#[test]
fn a_session_without_a_recorded_id_cannot_resume_and_says_so() {
    let rig = rig();
    let engine = rig.engine("state");
    let created = create(&engine, "codex");
    args(&rig, "codex.args", 1);
    let restarted = rig.restart(engine, |_| {});
    assert_eq!(only_session(&restarted)["canResume"], false);
    let error = resume(&restarted, &created).unwrap_err();
    assert!(error.starts_with("resume_unavailable: "), "{error}");
}
