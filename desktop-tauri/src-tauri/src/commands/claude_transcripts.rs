//! Where Claude keeps the conversation a pane wants, and whether it is there.
//!
//! Transcripts live under `<CLAUDE_CONFIG_DIR>/projects/<project-slug>/`, one
//! `<conversation-id>.jsonl` per conversation started in that folder.
//!
//! `--resume` finds an id in whichever project folder holds it, not only the
//! one matching the current directory — verified against claude 2.1.238 by
//! resuming a conversation from a different folder, which found it and kept
//! appending to the original file. Matching on the id alone therefore agrees
//! with the CLI, and avoids rebuilding a folder name out of a working
//! directory the pane may not be launched in again.
//!
//! The lookup returns a *relative* path rather than a bare yes. Carrying a
//! conversation onto another account has to recreate it in the same place
//! under that account's root, and the project slug is the part that has to
//! survive the move.

use std::path::{Path, PathBuf};

/// Where `session`'s transcript sits beneath `projects`, if it is there.
pub fn find_conversation(projects: &Path, session: &str) -> Option<PathBuf> {
    let transcript = format!("{session}.jsonl");
    std::fs::read_dir(projects)
        .ok()?
        .flatten()
        .find_map(|entry| {
            let relative = PathBuf::from(entry.file_name()).join(&transcript);
            projects.join(&relative).is_file().then_some(relative)
        })
}

/// Whether a transcript recording `session` exists anywhere under `projects`.
pub fn holds_conversation(projects: &Path, session: &str) -> bool {
    find_conversation(projects, session).is_some()
}

#[cfg(test)]
mod tests {
    use super::{find_conversation, holds_conversation};
    use std::path::{Path, PathBuf};

    const SESSION: &str = "d0ca6bb9-3439-408c-9d9b-b6d28d53ac3e";

    /// A throwaway stand-in for `~/.claude/projects`.
    fn projects(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "vibyra-claude-projects-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("fixture root");
        root
    }

    fn write_transcript(root: &Path, slug: &str, session: &str) {
        let folder = root.join(slug);
        std::fs::create_dir_all(&folder).expect("project folder");
        std::fs::write(folder.join(format!("{session}.jsonl")), "{}\n").expect("transcript");
    }

    #[test]
    fn finds_a_transcript_under_the_project_that_holds_it() {
        let root = projects("found");
        write_transcript(&root, "-home-ellis-Desktop-Vibyra", SESSION);
        assert_eq!(
            find_conversation(&root, SESSION),
            Some(PathBuf::from("-home-ellis-Desktop-Vibyra").join(format!("{SESSION}.jsonl"))),
        );
    }

    /// The id is searched for across every project, because `--resume` is.
    #[test]
    fn finds_a_transcript_left_in_another_project() {
        let root = projects("other-project");
        write_transcript(&root, "-home-ellis-Desktop-Elsewhere", SESSION);
        assert!(holds_conversation(&root, SESSION));
    }

    #[test]
    fn a_missing_transcript_is_not_held() {
        let root = projects("missing");
        write_transcript(&root, "-home-ellis", "11111111-2222-3333-4444-555555555555");
        assert!(!holds_conversation(&root, SESSION));
        assert_eq!(find_conversation(&root, SESSION), None);
    }

    /// A root that was never created reads as no conversation, not a panic.
    #[test]
    fn a_missing_root_is_not_held() {
        let root = std::env::temp_dir().join("vibyra-claude-projects-absent");
        let _ = std::fs::remove_dir_all(&root);
        assert!(!holds_conversation(&root, SESSION));
    }
}
