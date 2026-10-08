//! The name a pane's own agent gave its conversation, plus the first request
//! typed into it. The renderer turns these into the pane's title.
//!
//! Claude Code writes a model-made `ai-title` line into the conversation's
//! transcript, and Codex appends a `thread_name` to `session_index.jsonl`. Both
//! are real summaries written with the whole conversation in view, so they beat
//! anything derived from the first prompt; reading them costs nothing and
//! sends nothing anywhere. Every other CLI falls back to its first request.

use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

#[path = "native_first_requests.rs"]
mod first_requests;
use first_requests::first_requests;

/// Titles are re-emitted as the transcript grows, so the end of the file is
/// enough, and a transcript can be tens of megabytes.
const TAIL_BYTES: u64 = 512 * 1024;
const MAX_REQUESTS: usize = 48;
const MAX_TITLE_CHARS: usize = 200;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleRequest {
    pub id: u64,
    pub agent_id: String,
    pub session_id: Option<String>,
    pub account_id: Option<String>,
    /// A conversation terminal: no PTY, so its requests come from the transcript.
    #[serde(default)]
    pub conversation: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TitleHint {
    pub id: u64,
    /// The first request sent to this live terminal, when there has been one.
    pub prompt: Option<String>,
    /// The title the agent itself gave the conversation.
    pub native_title: Option<String>,
    /// A conversation's first few requests, oldest first.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub requests: Vec<String>,
}

pub fn hints(manager: &vibyra_core::pty::PtyManager, requests: &[TitleRequest]) -> Vec<TitleHint> {
    let registry = crate::provider_auth_registry::Registry::load();
    requests
        .iter()
        .take(MAX_REQUESTS)
        .map(|request| {
            let prompt = (!request.conversation)
                .then(|| manager.first_prompt(request.id).ok().flatten())
                .flatten();
            let config = request
                .session_id
                .as_deref()
                .filter(|id| crate::commands::terminal_args::validate_session_id(id).is_ok())
                .and_then(|session_id| {
                    let account = request.account_id.as_deref().unwrap_or("default");
                    Some((
                        registry
                            .home(&request.agent_id, account)
                            .ok()?
                            .credentials_dir(),
                        session_id,
                    ))
                });
            let native_title = config
                .as_ref()
                .and_then(|(dir, id)| native_title(&request.agent_id, dir, id));
            let requests = match (&config, request.conversation) {
                (Some((dir, id)), true) => first_requests(&request.agent_id, dir, id),
                _ => Vec::new(),
            };
            TitleHint {
                id: request.id,
                prompt,
                native_title,
                requests,
            }
        })
        .filter(|hint| {
            hint.prompt.is_some() || hint.native_title.is_some() || !hint.requests.is_empty()
        })
        .collect()
}

pub fn native_title(agent_id: &str, config_dir: &Path, session_id: &str) -> Option<String> {
    match agent_id {
        "claude" => claude_title(config_dir, session_id),
        "codex" => codex_title(config_dir, session_id),
        _ => None,
    }
}

/// The last `ai-title` in `<config>/projects/<folder>/<session>.jsonl`. The
/// folder is the working directory spelled with dashes, which a safe-worktree
/// pane does not share with its project, so every folder is tried.
pub fn claude_title(config_dir: &Path, session_id: &str) -> Option<String> {
    let file = format!("{session_id}.jsonl");
    let transcript = std::fs::read_dir(config_dir.join("projects"))
        .ok()?
        .flatten()
        .map(|folder| folder.path().join(&file))
        .find(|path| path.is_file())?;
    last_matching(&tail(&transcript, TAIL_BYTES)?, |line| {
        if !line.contains("\"ai-title\"") {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(line).ok()?;
        (value["type"] == "ai-title").then_some(())?;
        clean(value["aiTitle"].as_str()?)
    })
}

/// The newest `thread_name` Codex recorded for this conversation. It first
/// writes a clipped copy of the prompt and replaces it with a real summary a
/// moment later, so the last entry is the one that counts.
pub fn codex_title(config_dir: &Path, session_id: &str) -> Option<String> {
    let index: PathBuf = config_dir.join("session_index.jsonl");
    let needle = format!("\"{session_id}\"");
    last_matching(&tail(&index, TAIL_BYTES * 8)?, |line| {
        if !line.contains(&needle) {
            return None;
        }
        let value: serde_json::Value = serde_json::from_str(line).ok()?;
        (value["id"] == session_id).then_some(())?;
        clean(value["thread_name"].as_str()?)
    })
}

fn last_matching(text: &str, pick: impl Fn(&str) -> Option<String>) -> Option<String> {
    text.lines().rev().find_map(pick)
}

fn clean(title: &str) -> Option<String> {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    let title: String = title.chars().take(MAX_TITLE_CHARS).collect();
    (!title.is_empty()).then_some(title)
}

/// The last `bytes` of a file as text, starting on a whole line.
fn tail(path: &Path, bytes: u64) -> Option<String> {
    let mut file = File::open(path).ok()?;
    let length = file.metadata().ok()?.len();
    let start = length.saturating_sub(bytes);
    file.seek(SeekFrom::Start(start)).ok()?;
    let mut raw = Vec::with_capacity(usize::try_from(length - start).ok()?);
    file.take(bytes).read_to_end(&mut raw).ok()?;
    let text = String::from_utf8_lossy(&raw);
    if start == 0 {
        return Some(text.into_owned());
    }
    // Landed mid-line, and possibly mid-character: drop the partial first line.
    text.split_once('\n').map(|(_, rest)| rest.to_owned())
}

#[cfg(test)]
#[path = "native_titles_tests.rs"]
mod tests;
