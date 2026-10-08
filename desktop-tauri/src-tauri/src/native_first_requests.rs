//! The first things a person asked in a conversation, read back from the
//! transcript its CLI keeps. Vibyra's own Codex and Claude conversation
//! terminals never pass keystrokes through a PTY, so prompt capture never sees
//! them, and Codex does not name app-server threads in `session_index.jsonl`.
//! Several are returned because the first is often only "hi".

use std::fs::File;
use std::io::{BufRead, BufReader, Read};
use std::path::{Path, PathBuf};

use serde_json::Value;

/// Requests sit near the top; a long transcript is never read to its end.
const HEAD_BYTES: u64 = 4 << 20;
const MAX_REQUESTS: usize = 4;
const MAX_CHARS: usize = 600;

pub fn first_requests(agent_id: &str, config_dir: &Path, session_id: &str) -> Vec<String> {
    let found = match agent_id {
        "claude" => find_claude(&config_dir.join("projects"), session_id)
            .map(|path| (path, claude_request as Pick)),
        "codex" => find_codex(
            &config_dir.join("sessions"),
            &format!("-{session_id}.jsonl"),
            0,
        )
        .map(|path| (path, codex_request as Pick)),
        _ => None,
    };
    found
        .map(|(path, pick)| read_requests(&path, pick))
        .unwrap_or_default()
}

type Pick = fn(&Value) -> Option<String>;

fn read_requests(path: &Path, pick: Pick) -> Vec<String> {
    let Ok(file) = File::open(path) else {
        return Vec::new();
    };
    BufReader::new(file.take(HEAD_BYTES))
        .split(b'\n')
        .map_while(Result::ok)
        .filter(|line| line.windows(6).any(|w| w == b"\"user\""))
        .filter_map(|line| serde_json::from_slice::<Value>(&line).ok())
        .filter_map(|event| pick(&event))
        .take(MAX_REQUESTS)
        .collect()
}

/// Text a person typed, not the harness context wrapped around it.
fn typed(text: &str) -> Option<String> {
    let text = text.trim();
    let wrapped =
        text.starts_with('<') || text.starts_with("# AGENTS.md") || text.starts_with("Caveat:");
    (!text.is_empty() && !wrapped).then(|| text.chars().take(MAX_CHARS).collect())
}

/// Codex: `response_item` user messages; `<environment_context>` is skipped.
fn codex_request(event: &Value) -> Option<String> {
    let payload = &event["payload"];
    let user = event["type"] == "response_item"
        && payload["type"] == "message"
        && payload["role"] == "user";
    if !user {
        return None;
    }
    payload["content"]
        .as_array()?
        .iter()
        .find_map(|part| typed(part["text"].as_str()?))
}

/// Claude: a main-thread user line whose content is text, not a tool result.
fn claude_request(event: &Value) -> Option<String> {
    if event["type"] != "user" || event["isMeta"] == true || event["isSidechain"] == true {
        return None;
    }
    let content = &event["message"]["content"];
    if let Some(text) = content.as_str() {
        return typed(text);
    }
    content
        .as_array()?
        .iter()
        .filter(|part| part["type"] == "text")
        .find_map(|part| typed(part["text"].as_str()?))
}

/// Claude keeps `<projects>/<folder>/<id>.jsonl`; `--resume` finds an id in
/// whichever folder holds it, so the id alone decides.
fn find_claude(projects: &Path, session: &str) -> Option<PathBuf> {
    let name = format!("{session}.jsonl");
    std::fs::read_dir(projects)
        .ok()?
        .flatten()
        .find_map(|entry| {
            let file = entry.path().join(&name);
            let plain = std::fs::symlink_metadata(&file).ok()?.is_file();
            (entry.file_type().ok()?.is_dir() && plain).then_some(file)
        })
}

/// Codex rollouts live under sessions/year/month/day, newest folder first.
/// Symlinked entries are ignored.
fn find_codex(root: &Path, suffix: &str, depth: usize) -> Option<PathBuf> {
    let mut folders = Vec::new();
    for entry in std::fs::read_dir(root).ok()?.flatten() {
        let kind = entry.file_type().ok()?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if kind.is_file() && name.starts_with("rollout-") && name.ends_with(suffix) {
            return Some(entry.path());
        }
        if kind.is_dir() && depth < 3 {
            folders.push(name);
        }
    }
    folders.sort_unstable_by(|a, b| b.cmp(a));
    folders
        .iter()
        .find_map(|name| find_codex(&root.join(name), suffix, depth + 1))
}
