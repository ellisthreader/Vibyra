use std::path::{Path, PathBuf};

use super::agent_conversations::ConversationStore;

const SESSION: &str = "3f9a1c2e-5b7d-4e81-9a3f-2c6d8e0b4a17";

/// A throwaway stand-in for `~/.claude/projects`.
fn projects(name: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "vibyra-conversations-{}-{name}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    std::fs::create_dir_all(&root).expect("fixture root");
    root
}

fn write_transcript(root: &Path, project: &str, session: &str) {
    let folder = root.join(project);
    std::fs::create_dir_all(&folder).expect("project folder");
    std::fs::write(folder.join(format!("{session}.jsonl")), "{}\n").expect("transcript");
}

#[test]
fn a_conversation_that_was_written_can_be_resumed() {
    let root = projects("written");
    write_transcript(&root, "-home-someone-work", SESSION);

    assert!(ConversationStore::rooted_at(root).resumable("claude", SESSION));
}

#[test]
fn a_pane_that_was_never_typed_into_has_nothing_to_resume() {
    // The bug this file exists for: Claude writes no transcript until the
    // first message, so an untouched pane's id names nothing and `--resume`
    // exits 1 instead of opening an empty chat.
    let root = projects("untouched");
    write_transcript(
        &root,
        "-home-someone-work",
        "9c2b7d10-4e6a-4f52-8b31-0d5e7a1c9f44",
    );

    assert!(!ConversationStore::rooted_at(root).resumable("claude", SESSION));
}

#[test]
fn a_conversation_is_found_in_whichever_project_folder_holds_it() {
    // `--resume` looks an id up across every project, so the folder a pane is
    // relaunched in — a fresh safe-mode worktree, say — must not decide this.
    let root = projects("any-folder");
    write_transcript(
        &root,
        "-home-someone-first",
        "0f7e1b23-6c4d-4a89-9e15-3b8c2d6f0a71",
    );
    write_transcript(&root, "-home-someone-second", SESSION);

    assert!(ConversationStore::rooted_at(root).resumable("claude", SESSION));
}

#[test]
fn an_id_that_is_not_a_uuid_is_never_looked_up() {
    let root = projects("hostile");

    for hostile in ["../../etc/passwd", "..", "", "not-a-uuid"] {
        let store = ConversationStore::rooted_at(root.clone());
        assert!(!store.resumable("claude", hostile), "{hostile}");
    }
}

#[test]
fn agents_without_a_local_preflight_are_admitted() {
    // Gemini resumes by recency, and a plain terminal has no conversation at
    // all. Neither is ever handed an id, so neither can be killed by one.
    let root = projects("recency");

    for agent in ["gemini", "shell", "ssh", "my-custom-agent"] {
        let store = ConversationStore::rooted_at(root.clone());
        assert!(store.resumable(agent, SESSION), "{agent}");
    }
}

/// A throwaway stand-in for `~/.codex/sessions`, holding one rollout.
fn sessions_holding(name: &str, session: &str) -> PathBuf {
    let root = std::env::temp_dir().join(format!(
        "vibyra-conversations-codex-{}-{name}",
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&root);
    let day = root.join("2026").join("08").join("24");
    std::fs::create_dir_all(&day).expect("day folder");
    std::fs::write(
        day.join(format!("rollout-2026-08-24T10-43-23-{session}.jsonl")),
        "{}\n",
    )
    .expect("rollout");
    root
}

#[test]
fn a_codex_conversation_that_still_exists_can_be_resumed() {
    let root = sessions_holding("present", SESSION);

    assert!(ConversationStore::rooted_at_sessions(root).resumable("codex", SESSION));
}

#[test]
fn a_codex_conversation_that_is_gone_is_relaunched_instead() {
    // The bug this covers: `codex resume <id>` exits 1 on an id it cannot
    // resolve, so a pane carrying a stale one came back dead. Ids do go stale
    // — a rollout can be archived, cleaned up, or belong to a subagent thread
    // that has since finished.
    let root = sessions_holding("stale", "01a03327-3b27-7fe0-9cb9-eb55467c0a73");

    assert!(!ConversationStore::rooted_at_sessions(root).resumable("codex", SESSION));
}

#[test]
fn a_codex_id_that_is_not_a_uuid_is_never_looked_up() {
    let root = sessions_holding("hostile", SESSION);

    for hostile in ["../../etc/passwd", "..", "", "not-a-uuid"] {
        let store = ConversationStore::rooted_at_sessions(root.clone());
        assert!(!store.resumable("codex", hostile), "{hostile}");
    }
}

#[test]
fn a_codex_preflight_that_cannot_run_does_not_veto_the_resume() {
    // Unknown is not absent. A Codex id is only persisted after being read
    // from a rollout that existed, so with no `CODEX_HOME` to search the id is
    // still the best evidence available — and blocking on that would stop
    // every Codex pane on the machine from resuming.
    let nowhere = ConversationStore::rooted_at(projects("no-codex-home"));

    assert!(nowhere.resumable("codex", SESSION));
}

#[test]
fn nowhere_to_look_reads_as_no_conversation() {
    let missing = projects("missing").join("never-created");

    assert!(!ConversationStore::rooted_at(missing).resumable("claude", SESSION));
}
