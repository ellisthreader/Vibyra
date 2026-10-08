//! What a conversation list needs from the first bytes of a transcript: the
//! first thing the person said, and (Codex) the folder it ran in. Only the head
//! of a file is ever handed in, it may end mid-line or hold invalid UTF-8, and
//! nothing but a short title leaves this module.
use serde_json::Value;
use std::path::PathBuf;

pub(crate) const TITLE_FALLBACK: &str = "Conversation";
const TITLE_CHARS: usize = 80;

/// Complete lines of `head` that parse as JSON, with their position. A line cut
/// off by the read limit, or damaged, is simply absent.
fn records(head: &[u8]) -> impl Iterator<Item = Value> + '_ {
    head.split(|byte| *byte == b'\n')
        .filter_map(|line| serde_json::from_str::<Value>(&String::from_utf8_lossy(line)).ok())
}

/// Text a CLI injects on the person's behalf rather than something they typed.
fn injected(text: &str) -> bool {
    let text = text.trim_start();
    text.is_empty()
        || [
            "<command-",
            "<local-command",
            "<system-reminder",
            "<environment_context",
            "<user_instructions",
            "<ide_",
            "Caveat:",
            "# AGENTS.md",
            "[Request interrupted",
        ]
        .iter()
        .any(|prefix| text.starts_with(prefix))
}

/// Whitespace collapsed, control characters dropped, at most 80 characters.
pub(crate) fn finish(text: &str) -> String {
    let cleaned: String = text.chars().filter(|c| !c.is_control() || c.is_whitespace()).collect();
    let collapsed = cleaned.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.is_empty() {
        return TITLE_FALLBACK.into();
    }
    if collapsed.chars().count() <= TITLE_CHARS {
        return collapsed;
    }
    let mut short: String = collapsed.chars().take(TITLE_CHARS - 1).collect();
    short.push('\u{2026}');
    short
}

fn message_text(content: &Value, part: &str) -> Option<String> {
    match content {
        Value::String(text) => Some(text.clone()),
        Value::Array(parts) => parts.iter().find_map(|item| {
            (item["type"] == part)
                .then(|| item["text"].as_str())
                .flatten()
                .filter(|text| !injected(text))
                .map(str::to_owned)
        }),
        _ => None,
    }
}

/// The first user message of a Claude transcript.
pub(crate) fn claude_title(head: &[u8]) -> String {
    let found = records(head).find_map(|record| {
        if record["type"] != "user"
            || record["isMeta"] == true
            || record["isSidechain"] == true
            || record["message"]["role"] != "user"
        {
            return None;
        }
        message_text(&record["message"]["content"], "text").filter(|text| !injected(text))
    });
    found.map_or_else(|| TITLE_FALLBACK.into(), |text| finish(&text))
}

/// The first user message of a Codex rollout: the `user_message` event, else
/// the first user `response_item` that is not injected context.
pub(crate) fn codex_title(head: &[u8]) -> String {
    let mut fallback = None;
    for record in records(head) {
        let payload = &record["payload"];
        match record["type"].as_str() {
            Some("event_msg") if payload["type"] == "user_message" => {
                if let Some(text) = payload["message"].as_str().filter(|t| !injected(t)) {
                    return finish(text);
                }
            }
            Some("response_item")
                if fallback.is_none()
                    && payload["type"] == "message"
                    && payload["role"] == "user" =>
            {
                fallback = message_text(&payload["content"], "input_text");
            }
            _ => {}
        }
    }
    fallback.map_or_else(|| TITLE_FALLBACK.into(), |text| finish(&text))
}

/// `payload.cwd` of the first `session_meta` line. Codex puts its long
/// instructions on that line, so it can run past the read limit; then the one
/// string after `"cwd":` is taken from the cut-off text (a quote inside a JSON
/// string is always escaped, so `"cwd":` cannot occur inside one).
pub(crate) fn codex_cwd(head: &[u8]) -> Option<PathBuf> {
    for record in records(head) {
        if record["type"] == "session_meta" {
            return record["payload"]["cwd"].as_str().map(PathBuf::from);
        }
    }
    let first = head.split(|byte| *byte == b'\n').next()?;
    let first = String::from_utf8_lossy(first);
    if !first.contains("\"type\":\"session_meta\"") {
        return None;
    }
    let rest = &first[first.find("\"cwd\":")? + "\"cwd\":".len()..];
    serde_json::Deserializer::from_str(rest.trim_start())
        .into_iter::<String>()
        .next()?
        .ok()
        .map(PathBuf::from)
}
