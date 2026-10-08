//! Reading the transcript files a subagent list is built from: newest-first
//! folders, bounded heads, incremental reads and the rows they become.

use std::collections::HashMap;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use serde_json::{json, Value};

use super::agent_subagents::{ACTIVITY, CACHE_LIMIT};
use super::agent_subagents_scan::Activity;

pub(super) fn none(reason: &str) -> Value {
    json!({"agents":[],"unavailable":reason})
}

/// Plain files directly inside `folder` whose names match, newest first.
pub(super) fn newest(folder: &Path, keep: impl Fn(&str) -> bool) -> Vec<PathBuf> {
    if !std::fs::symlink_metadata(folder).is_ok_and(|m| m.is_dir()) {
        return Vec::new();
    }
    let Ok(entries) = std::fs::read_dir(folder) else {
        return Vec::new();
    };
    let mut found: Vec<(SystemTime, PathBuf)> = entries
        .flatten()
        .filter(|entry| keep(&entry.file_name().to_string_lossy()))
        .filter_map(|entry| {
            let meta = std::fs::symlink_metadata(entry.path()).ok()?;
            meta.is_file().then(|| {
                (
                    meta.modified().unwrap_or(SystemTime::UNIX_EPOCH),
                    entry.path(),
                )
            })
        })
        .collect();
    found.sort_by_key(|entry| std::cmp::Reverse(entry.0));
    found.into_iter().map(|(_, path)| path).collect()
}

pub(super) fn head(path: &Path, limit: u64) -> String {
    if !std::fs::symlink_metadata(path).is_ok_and(|m| m.is_file()) {
        return String::new();
    }
    let mut bytes = Vec::new();
    if let Ok(file) = std::fs::File::open(path) {
        let _ = file.take(limit).read_to_end(&mut bytes);
    }
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Advances every transcript under one lock, then hands back read-only views.
pub(super) fn read_all(
    paths: &[(PathBuf, bool)],
    answer: impl FnOnce(&HashMap<PathBuf, Activity>) -> Value,
) -> Value {
    let Ok(mut guard) = ACTIVITY.lock() else {
        return none("Subagents could not be read right now.");
    };
    let cache = guard.get_or_insert_with(HashMap::new);
    if cache.len() + paths.len() > CACHE_LIMIT {
        cache.clear();
    }
    for (path, codex) in paths {
        let activity = cache.entry(path.clone()).or_default();
        if activity.advance(path, *codex).is_err() {
            cache.remove(path);
        }
    }
    answer(cache)
}

pub(super) fn entry(id: &str, name: &str, kind: &str, activity: &Activity, state: &str) -> Value {
    json!({"id":id,"name":name,"kind":kind,"model":activity.model,"state":state,
        "startedAt":activity.first_at,"lastAt":activity.last_at,"doing":activity.doing,
        "files":activity.files})
}

/// The files one transcript edited, for the Code view's live faces. `by` is
/// the subagent that did it, or null for the terminal's own agent.
pub(super) fn edits(by: Option<&str>, activity: &Activity) -> Vec<Value> {
    activity
        .touched
        .iter()
        .map(|(path, at)| json!({"path":path,"at":at,"by":by}))
        .collect()
}
