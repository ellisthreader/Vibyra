//! Which Codex thread a rollout file records — the pane's own, or a subagent's.
//!
//! Codex hosts the subagents it spawns inside the same process, and every one
//! of them opens its own rollout file. A pane owns exactly one of those: the
//! conversation the user is typing into. "Whichever rollout this process has
//! open" is therefore a coin flip, and not a rare one — of the 1149 rollouts
//! on the machine this was written against, 634 were subagent threads.
//!
//! Getting it wrong is not cosmetic. The id is what `codex resume <id>` is
//! given when the pane comes back, and what the pane is named after; a
//! subagent's id resumes someone else's conversation or none at all.
//!
//! The file answers the question itself. Every rollout opens with a
//! `session_meta` line carrying `source`, and Codex records a thread it
//! spawned as an **object** (`{"subagent": …}`) where a thread a person opened
//! is a plain **string** (`"cli"`, `"vscode"`, `"exec"`). Measured across all
//! 1149 files, that shape agreed with the newer `thread_source` field in every
//! single case, and unlike `thread_source` — missing from 97 of them — it is
//! present in rollouts written by older Codex versions too.
//!
//! Testing the *shape* rather than listing the names we know is deliberate: a
//! Codex release that adds another interactive front end keeps working, while
//! one that adds another kind of derived thread is excluded by default. For a
//! value that decides which conversation a pane resumes, that is the safe way
//! round.

use std::io::{BufRead, BufReader, Read};
use std::path::Path;

/// The `session_meta` line carries Codex's whole base-instruction text inline,
/// so it is far from short: across all 1149 rollouts measured, the longest ran
/// to 22 394 bytes and `source` itself always landed within the first 418.
/// This is an order of magnitude of headroom over that, and the same ceiling
/// `chat_prompt` uses to scan the body.
const MAX_HEADER_BYTES: u64 = 256 * 1024;

/// Whether `rollout` is the conversation its process was started for.
///
/// A file that cannot be read, cannot be parsed, or has not been given its
/// header yet reads as `false`. That is the deliberate direction: a rollout is
/// only ever claimed on positive evidence, and the caller polls, so the cost
/// of waiting one sweep is nothing next to the cost of claiming a subagent's.
pub fn is_own_conversation(rollout: &Path) -> bool {
    let Ok(file) = std::fs::File::open(rollout) else {
        return false;
    };
    let mut header = String::new();
    let mut reader = BufReader::new(file).take(MAX_HEADER_BYTES);
    if reader.read_line(&mut header).is_err() {
        return false;
    }
    own_conversation_header(&header)
}

/// Split from the file read so the rule itself can be tested against literal
/// headers rather than fixtures on disk.
fn own_conversation_header(line: &str) -> bool {
    let Ok(entry) = serde_json::from_str::<serde_json::Value>(line) else {
        return false;
    };
    if entry.get("type").and_then(serde_json::Value::as_str) != Some("session_meta") {
        return false;
    }
    entry
        .get("payload")
        .and_then(|payload| payload.get("source"))
        .is_some_and(serde_json::Value::is_string)
}

#[cfg(test)]
mod tests {
    use super::{is_own_conversation, own_conversation_header};

    fn header(source: &str) -> String {
        format!(r#"{{"type":"session_meta","payload":{{"id":"x","source":{source}}}}}"#)
    }

    #[test]
    fn a_thread_someone_opened_is_the_panes_own() {
        assert!(own_conversation_header(&header(r#""cli""#)));
        // Other front ends write their own name; the shape is what matters.
        assert!(own_conversation_header(&header(r#""vscode""#)));
        assert!(own_conversation_header(&header(r#""exec""#)));
    }

    #[test]
    fn a_spawned_thread_is_not() {
        assert!(!own_conversation_header(&header(
            r#"{"subagent":{"thread_spawn":{"depth":1}}}"#
        )));
        // Any future object-shaped source is excluded for the same reason.
        assert!(!own_conversation_header(&header(r#"{"replay":{}}"#)));
    }

    #[test]
    fn anything_unreadable_is_not_claimed() {
        assert!(!own_conversation_header("not json at all"));
        assert!(!own_conversation_header(r#"{"type":"response_item"}"#));
        assert!(!own_conversation_header(
            r#"{"type":"session_meta","payload":{"id":"x"}}"#
        ));
        // A header that has been opened but not yet written.
        assert!(!own_conversation_header(""));
    }

    #[test]
    fn a_missing_file_is_not_claimed() {
        assert!(!is_own_conversation(std::path::Path::new(
            "/nonexistent/rollout.jsonl"
        )));
    }
}
