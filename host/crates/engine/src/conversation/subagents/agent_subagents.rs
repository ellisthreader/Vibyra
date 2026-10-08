//! The subagents a native Claude or Codex terminal started, read from the
//! transcripts those CLIs already keep. Read-only: no credential, no network,
//! and only files inside the account's own transcript folder.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};

use super::agent_subagents_codex::codex;
pub(super) use super::agent_subagents_files::{edits, entry, head, newest, none, read_all};
use super::agent_subagents_scan::{Activity, Finish};
use super::paths::find_claude;

/// The newest subagents worth listing; older ones are not read at all.
pub(super) const SHOWN: usize = 12;
pub(super) const CACHE_LIMIT: usize = 64;

pub(super) static ACTIVITY: Mutex<Option<HashMap<PathBuf, Activity>>> = Mutex::new(None);

fn outcome(finish: Option<&Finish>, last: Option<&String>) -> &'static str {
    match finish {
        // Activity after the report means it was sent another message.
        Some(finish) if Some(&finish.at) >= last => match finish.status.as_str() {
            "failed" => "failed",
            "killed" | "stopped" => "stopped",
            _ => "done",
        },
        _ => "running",
    }
}

fn claude(root: &Path, session: &str) -> Value {
    let Some(main) = find_claude(root, session) else {
        return json!({"agents":[]});
    };
    let parent = main.with_extension("");
    if !std::fs::symlink_metadata(&parent).is_ok_and(|m| m.is_dir()) {
        return json!({"agents":[]});
    }
    let folder = parent.join("subagents");
    let mut files = newest(&folder, |name| {
        name.starts_with("agent-") && name.ends_with(".jsonl")
    });
    files.truncate(SHOWN);
    let paths: Vec<_> = std::iter::once(&main)
        .chain(&files)
        .map(|path| (path.clone(), false))
        .collect();
    read_all(&paths, |cache| {
        let mut finished: HashMap<&str, &Finish> = HashMap::new();
        for finish in paths
            .iter()
            .filter_map(|(path, _)| cache.get(path))
            .flat_map(|a| &a.finished)
        {
            let slot = finished.entry(finish.0.as_str()).or_insert(finish.1);
            if finish.1.at > slot.at {
                *slot = finish.1;
            }
        }
        let mut changed = cache
            .get(&main)
            .map(|activity| edits(None, activity))
            .unwrap_or_default();
        let agents: Vec<Value> = files
            .iter()
            .filter_map(|path| {
                let activity = cache.get(path)?;
                let stem = path.file_stem()?.to_string_lossy();
                let id = stem.trim_start_matches("agent-");
                let meta: Value =
                    serde_json::from_str(&head(&path.with_extension("meta.json"), 64 << 10))
                        .unwrap_or_default();
                let finish = [Some(id), meta["toolUseId"].as_str()]
                    .into_iter()
                    .flatten()
                    .filter_map(|key| finished.get(key).copied())
                    .max_by(|a, b| a.at.cmp(&b.at));
                let name = meta["description"].as_str().unwrap_or("Subagent");
                let kind = meta["agentType"].as_str().unwrap_or("agent");
                let state = outcome(finish, activity.last_at.as_ref());
                changed.extend(edits(Some(name), activity));
                Some(entry(id, name, kind, activity, state))
            })
            .collect();
        json!({"agents":agents,"edits":changed})
    })
}

pub fn read(agent: &str, session: &str, root: &Path) -> Value {
    if !matches!(agent, "claude" | "codex") {
        return none("This provider does not report subagents.");
    }
    if session.len() != 36 || uuid::Uuid::parse_str(session).is_err() {
        return none("Subagents appear once this conversation has started.");
    }
    if agent == "codex" {
        codex(root, session)
    } else {
        claude(root, session)
    }
}
