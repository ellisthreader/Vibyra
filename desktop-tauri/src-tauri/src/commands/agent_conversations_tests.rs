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
fn agents_that_resume_by_recency_have_no_id_that_can_go_missing() {
    // Codex and Gemini resume the newest conversation and ignore any id, so
    // refusing them here would break a resume that works perfectly well.
    let root = projects("recency");

    for agent in ["codex", "gemini", "shell", "ssh", "my-custom-agent"] {
        let store = ConversationStore::rooted_at(root.clone());
        assert!(store.resumable(agent, SESSION), "{agent}");
    }
}

#[test]
fn nowhere_to_look_reads_as_no_conversation() {
    let missing = projects("missing").join("never-created");

    assert!(!ConversationStore::rooted_at(missing).resumable("claude", SESSION));
}
