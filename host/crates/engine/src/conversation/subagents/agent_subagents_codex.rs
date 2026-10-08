//! Codex keeps each spawned agent in its own rollout, whose first line names
//! the session that started it.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde_json::{json, Value};

use super::agent_subagents::{edits, entry, newest, read_all, SHOWN};
use super::paths::find_codex;

const HEAD_BYTES: u64 = 512 << 10;

/// Codex rollout → the session that spawned it, or None for a top-level one.
static CODEX_OWNERS: Mutex<Option<HashMap<PathBuf, Option<String>>>> = Mutex::new(None);

/// `root/year/month/day`, oldest first.
fn day_folders(root: &Path) -> Vec<PathBuf> {
    let mut days = vec![root.to_path_buf()];
    for _ in 0..3 {
        days = days
            .iter()
            .flat_map(|folder| {
                let mut inner: Vec<PathBuf> = std::fs::read_dir(folder)
                    .into_iter()
                    .flatten()
                    .flatten()
                    .filter(|entry| entry.file_type().map(|kind| kind.is_dir()).unwrap_or(false))
                    .map(|entry| entry.path())
                    .collect();
                inner.sort();
                inner
            })
            .collect();
    }
    days
}

/// The root session a subagent rollout belongs to, from its first line.
fn codex_owner(path: &Path) -> (Option<String>, bool) {
    use std::io::{BufRead, Read};
    let mut text = String::new();
    if let Ok(file) = std::fs::File::open(path) {
        let _ = std::io::BufReader::new(file.take(HEAD_BYTES)).read_line(&mut text);
    }
    let complete = text.ends_with('\n');
    let first = text.lines().next().unwrap_or_default();
    if let Ok(meta) = serde_json::from_str::<Value>(first) {
        let source = &meta["payload"]["source"]["subagent"]["thread_spawn"];
        if let Some(owner) = source["parent_thread_id"].as_str() {
            return (Some(owner.to_owned()), complete);
        }
    }
    let mark = "\"session_id\":\"";
    let owner = text
        .find(mark)
        .map(|at| &text[at + mark.len()..])
        .and_then(|rest| rest.get(..36))
        .filter(|_| text.contains("\"thread_source\":\"subagent\""));
    (owner.map(str::to_owned), complete)
}

pub(super) fn codex(root: &Path, session: &str) -> Value {
    let Some(main) = find_codex(root, &format!("-{session}.jsonl"), 0) else {
        return json!({"agents":[]});
    };
    let Some(day) = main.parent() else {
        return json!({"agents":[]});
    };
    let mut candidates = Vec::new();
    let mut guard = CODEX_OWNERS
        .lock()
        .unwrap_or_else(|poison| poison.into_inner());
    let owners = guard.get_or_insert_with(HashMap::new);
    if owners.len() > 4096 {
        owners.clear();
    }
    // A resumed parent can launch agents weeks later; inspect all later days.
    for folder in day_folders(root)
        .into_iter()
        .filter(|folder| folder.as_path() >= day)
    {
        for path in newest(&folder, |name| {
            name.starts_with("rollout-") && name.ends_with(".jsonl")
        }) {
            let owner = match owners.get(&path) {
                Some(owner) => owner.clone(),
                None => {
                    let (owner, complete) = codex_owner(&path);
                    if complete {
                        owners.insert(path.clone(), owner.clone());
                    }
                    owner
                }
            };
            if path != main {
                if let Some(owner) = owner {
                    candidates.push((path, owner));
                }
            }
        }
    }
    drop(guard);
    // Include descendants too: modern Codex names the immediate parent thread.
    let mut family = HashSet::from([session.to_owned()]);
    loop {
        let before = family.len();
        for (path, owner) in &candidates {
            if family.contains(owner) {
                if let Some(id) = path
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .and_then(|s| s.get(s.len().checked_sub(36)?..))
                {
                    family.insert(id.to_owned());
                }
            }
        }
        if family.len() == before {
            break;
        }
    }
    let mut children: Vec<_> = candidates
        .into_iter()
        .filter(|(_, owner)| family.contains(owner))
        .map(|(path, _)| path)
        .collect();
    children.sort_by_key(|path| {
        std::cmp::Reverse(std::fs::metadata(path).and_then(|m| m.modified()).ok())
    });
    children.truncate(SHOWN);
    let paths: Vec<_> = std::iter::once(&main)
        .chain(&children)
        .map(|path| (path.clone(), true))
        .collect();
    read_all(&paths, |cache| {
        let mut changed = cache
            .get(&main)
            .map(|activity| edits(None, activity))
            .unwrap_or_default();
        let agents: Vec<Value> = children
            .iter()
            .filter_map(|path| {
                let activity = cache.get(path)?;
                let meta = activity.head.as_ref()?;
                let task = meta["agent_path"]
                    .as_str()
                    .and_then(|p| p.rsplit('/').next())
                    .unwrap_or_default();
                let name = if task.is_empty() {
                    "Subagent".to_owned()
                } else {
                    task.replace('_', " ")
                };
                let kind = meta["agent_nickname"]
                    .as_str()
                    .or(meta["agent_role"].as_str())
                    .unwrap_or("agent");
                let state = if activity.working { "running" } else { "done" };
                changed.extend(edits(Some(&name), activity));
                Some(entry(
                    meta["id"].as_str().unwrap_or_default(),
                    &name,
                    kind,
                    activity,
                    state,
                ))
            })
            .collect();
        json!({"agents":agents,"edits":changed})
    })
}
