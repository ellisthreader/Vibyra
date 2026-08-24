//! Whether Codex still holds the conversation a pane wants to resume.
//!
//! Codex resolves an id itself, and refuses one it cannot find: `codex resume
//! <id>` answers `ERROR: No saved session found with ID <id>` and exits 1 —
//! verified against codex-cli 0.149.0 — so a pane handed a stale id dies on
//! relaunch rather than opening a fresh conversation. Restoring a workspace
//! then greets the user with a dead pane where their work should be, which is
//! exactly the failure `agent_conversations` already spares Claude, and it is
//! worth sparing here for the same reason.
//!
//! Rollouts live under `<CODEX_HOME>/sessions/<year>/<month>/<day>/`, one file
//! per thread, named `rollout-<timestamp>-<id>.jsonl`. Only names are read,
//! never contents, so a preflight costs a handful of directory listings.

use std::path::Path;

/// `sessions/<year>/<month>/<day>/<file>` is four levels deep; the extra one
/// is slack for a layout change. The bound is what stops an unexpectedly deep
/// or symlinked tree from turning a preflight into a filesystem crawl.
const MAX_DEPTH: usize = 5;

/// Whether a rollout recording `session` exists anywhere under `sessions`.
///
/// Both ends of the name are checked. Matching the id as a bare substring
/// would accept a different conversation that merely contains it, and matching
/// the suffix alone would accept any file that happens to end that way.
pub fn holds_conversation(sessions: &Path, session: &str) -> bool {
    let suffix = format!("-{session}.jsonl");
    let mut pending = vec![(sessions.to_path_buf(), 0usize)];
    while let Some((directory, depth)) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_dir() {
                if depth < MAX_DEPTH {
                    pending.push((entry.path(), depth + 1));
                }
                continue;
            }
            let name = entry.file_name();
            let Some(name) = name.to_str() else {
                continue;
            };
            if name.starts_with("rollout-") && name.ends_with(&suffix) {
                return true;
            }
        }
    }
    false
}

#[cfg(test)]
mod tests {
    use super::holds_conversation;
    use std::path::{Path, PathBuf};

    const SESSION: &str = "01a03327-3969-7a13-9437-77ddb5ef7e9a";

    /// A throwaway stand-in for `~/.codex/sessions`.
    fn sessions(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "vibyra-codex-sessions-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(&root).expect("fixture root");
        root
    }

    fn write_rollout(root: &Path, name: &str) {
        let day = root.join("2026").join("08").join("24");
        std::fs::create_dir_all(&day).expect("day folder");
        std::fs::write(day.join(name), "{}\n").expect("rollout");
    }

    #[test]
    fn a_rollout_is_found_through_the_dated_folders() {
        let root = sessions("dated");
        write_rollout(
            &root,
            &format!("rollout-2026-08-24T10-43-23-{SESSION}.jsonl"),
        );

        assert!(holds_conversation(&root, SESSION));
    }

    #[test]
    fn a_conversation_that_is_gone_is_not_claimed() {
        // The bug this file exists for: Codex kills the pane over an id it
        // cannot resolve, so the id must be checked before it is named.
        let root = sessions("gone");
        write_rollout(
            &root,
            "rollout-2026-08-24T10-43-24-01a03327-3b27-7fe0-9cb9-eb55467c0a73.jsonl",
        );

        assert!(!holds_conversation(&root, SESSION));
    }

    #[test]
    fn a_name_that_merely_contains_the_id_is_not_a_match() {
        let root = sessions("lookalike");
        write_rollout(
            &root,
            &format!("rollout-2026-08-24T10-43-23-{SESSION}.jsonl.bak"),
        );
        write_rollout(&root, &format!("notes-about-{SESSION}.jsonl"));

        assert!(!holds_conversation(&root, SESSION));
    }

    #[test]
    fn nowhere_to_look_is_not_a_match() {
        let missing = sessions("missing").join("never-created");

        assert!(!holds_conversation(&missing, SESSION));
    }
}
