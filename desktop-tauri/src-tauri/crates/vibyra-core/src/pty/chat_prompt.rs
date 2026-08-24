//! The prompt a Codex pane is actually about, read from Codex's own transcript.
//!
//! Reconstructing it from keystrokes cannot work: xterm's data stream carries
//! the terminal's own replies to Codex's `OSC 10/11` colour queries, dictated
//! prompts are written straight to the PTY and never pass through the
//! keyboard, and a resumed pane has nothing typed in it at all. Codex writes
//! every submitted message to a rollout file as it goes, so that file — not
//! the keyboard — is the source of truth.
//!
//! Only the first submitted message is read, and only far enough to find it.

use std::io::{BufRead, BufReader, Read};
use std::path::Path;

/// Enough for the injected preamble plus a long opening prompt, and small
/// enough that a rollout with a megabyte-scale pasted message is not read into
/// memory to name a tab.
const MAX_SCANNED_BYTES: u64 = 256 * 1024;
const MAX_PROMPT_CHARS: usize = 4_000;

/// The first message the user submitted, or `None` if they have not yet.
///
/// `Some("")` distinguishes "this pane has a readable transcript, which is
/// still empty" from "there is no transcript to read", which is what lets the
/// caller decide whether the keystroke fallback is still needed.
pub fn first_prompt(rollout: &Path) -> Option<String> {
    let file = std::fs::File::open(rollout).ok()?;
    let mut reader = BufReader::new(file).take(MAX_SCANNED_BYTES);
    let mut line = String::new();
    loop {
        line.clear();
        match reader.read_line(&mut line) {
            Ok(0) | Err(_) => return Some(String::new()),
            Ok(_) => {}
        }
        if let Some(prompt) = submitted_prompt(&line) {
            return Some(prompt);
        }
    }
}

/// One rollout line, if it holds a message the user typed rather than one
/// Codex injected for itself.
fn submitted_prompt(line: &str) -> Option<String> {
    let entry: serde_json::Value = serde_json::from_str(line).ok()?;
    let payload = entry.get("payload")?;
    if payload.get("type")?.as_str()? != "message" || payload.get("role")?.as_str()? != "user" {
        return None;
    }
    let text = payload
        .get("content")?
        .as_array()?
        .iter()
        .filter_map(|part| part.get("text")?.as_str())
        .collect::<Vec<_>>()
        .join(" ");
    let text = strip_attachments(text.trim());
    (!text.is_empty() && !is_injected_context(text))
        .then(|| text.chars().take(MAX_PROMPT_CHARS).collect())
}

/// Codex opens every conversation with its own environment and instruction
/// blocks, which are recorded as user messages but were never typed.
fn is_injected_context(text: &str) -> bool {
    text.starts_with("# AGENTS.md instructions")
        || (text.starts_with('<') && !text.starts_with("<image "))
}

/// A pasted image arrives as an `<image …>` tag followed by an `[Image #n]`
/// placeholder; the words the user typed come after them.
fn strip_attachments(text: &str) -> &str {
    let mut rest = text;
    loop {
        let trimmed = rest.trim_start();
        let end = if trimmed.starts_with("<image ") {
            trimmed.find("</image>").map(|at| at + "</image>".len())
        } else if trimmed.starts_with("[Image #") {
            trimmed.find(']').map(|at| at + 1)
        } else {
            None
        };
        match end {
            Some(at) => rest = &trimmed[at..],
            None => return trimmed,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::first_prompt;

    fn rollout(name: &str, lines: &[&str]) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "vibyra-chat-prompt-{}-{name}.jsonl",
            std::process::id()
        ));
        std::fs::write(&path, lines.join("\n")).expect("write rollout fixture");
        path
    }

    fn user(text: &str) -> String {
        let content = serde_json::json!([{ "type": "input_text", "text": text }]);
        format!(
            r#"{{"type":"response_item","payload":{{"type":"message","role":"user","content":{content}}}}}"#
        )
    }

    #[test]
    fn reads_past_the_context_codex_injects_for_itself() {
        let path = rollout(
            "injected",
            &[
                r#"{"type":"session_meta","payload":{"id":"x"}}"#,
                &user("# AGENTS.md instructions for /home/user/project\n<INSTRUCTIONS>"),
                &user("<environment_context>\n  <cwd>/home/user</cwd>"),
                &user("Can you run the mobile app, please?"),
                &user("Continue"),
            ],
        );
        assert_eq!(
            first_prompt(&path).as_deref(),
            Some("Can you run the mobile app, please?")
        );
        std::fs::remove_file(path).expect("remove rollout fixture");
    }

    #[test]
    fn a_pasted_image_does_not_become_the_prompt() {
        let path = rollout(
            "image",
            &[&user(
                r#"<image name=[Image #1] path="/home/user/shot.png"></image> [Image #1]  review this screenshot"#,
            )],
        );
        assert_eq!(
            first_prompt(&path).as_deref(),
            Some("review this screenshot")
        );
        std::fs::remove_file(path).expect("remove rollout fixture");
    }

    #[test]
    fn a_transcript_without_a_submitted_prompt_reads_as_empty() {
        let path = rollout(
            "empty",
            &[r#"{"type":"session_meta","payload":{"id":"x"}}"#],
        );
        assert_eq!(first_prompt(&path).as_deref(), Some(""));
        std::fs::remove_file(path).expect("remove rollout fixture");
    }

    #[test]
    fn a_missing_transcript_is_not_a_source_at_all() {
        assert_eq!(
            first_prompt(std::path::Path::new("/nonexistent/rollout.jsonl")),
            None
        );
    }
}
