//! `agent.sessions {projectId}`: the earlier Claude and Codex conversations this
//! computer holds for one project, so a phone can pick one to continue. Only
//! transcript files are read, and only their first 64 KiB; what leaves is a
//! provider, an id, a short title, a time and a size - never file contents.
use crate::agent_session::{valid_id, Homes};
use crate::agent_titles::{claude_title, codex_cwd, codex_title};
use crate::{text, Engine};
use serde_json::{json, Value};
use std::{
    io::Read,
    path::{Path, PathBuf},
    time::SystemTime,
};

pub(crate) const LIMIT: usize = 30;
const MAX_SIZE: u64 = 200 * 1024 * 1024;
const HEAD: u64 = 64 * 1024;
/// A Codex rollout names no project, so each one is opened to find its folder;
/// bound how many are, newest first, and how many files the walk will list.
const CODEX_OPENED: usize = 1000;
const CODEX_LISTED: usize = 20_000;

#[derive(Clone)]
struct Found {
    provider: &'static str,
    id: String,
    path: PathBuf,
    size: u64,
    modified: SystemTime,
}

/// Claude files a project under its folder with every character that is not an
/// ASCII letter or digit replaced by `-` (once per UTF-16 unit).
pub(crate) fn claude_folder(project: &Path) -> String {
    let mut folder = String::new();
    for c in project.to_string_lossy().chars() {
        if c.is_ascii_alphanumeric() {
            folder.push(c);
        } else {
            (0..c.len_utf16()).for_each(|_| folder.push('-'));
        }
    }
    folder
}

fn found(provider: &'static str, id: &str, entry: &std::fs::DirEntry) -> Option<Found> {
    // `DirEntry` metadata never follows a symlink, so a link is not a file here.
    let meta = entry.metadata().ok().filter(|m| m.is_file() && m.len() <= MAX_SIZE)?;
    Some(Found {
        provider,
        id: id.into(),
        path: entry.path(),
        size: meta.len(),
        modified: meta.modified().ok()?,
    })
}

fn claude_files(homes: &Homes, project: &Path) -> Vec<Found> {
    let dir = homes.claude.join("projects").join(claude_folder(project));
    let Ok(entries) = std::fs::read_dir(dir) else {
        return vec![];
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let name = entry.file_name();
            let id = name.to_str()?.strip_suffix(".jsonl")?;
            valid_id(id).then(|| found("claude", id, &entry)).flatten()
        })
        .collect()
}

/// `rollout-<time>-<uuid>.jsonl` -> the uuid.
fn rollout_id(name: &str) -> Option<&str> {
    let stem = name.strip_suffix(".jsonl")?.strip_prefix("rollout-")?;
    let id = stem.get(stem.len().checked_sub(36)?..)?;
    (stem[..stem.len() - 36].ends_with('-') && valid_id(id)).then_some(id)
}

fn walk_codex(dir: &Path, depth: usize, out: &mut Vec<Found>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if out.len() >= CODEX_LISTED {
            return;
        }
        let Ok(kind) = entry.file_type() else { continue };
        if kind.is_dir() {
            if depth < 4 {
                walk_codex(&entry.path(), depth + 1, out);
            }
        } else if let Some(file) = entry
            .file_name()
            .to_str()
            .and_then(rollout_id)
            .and_then(|id| found("codex", id, &entry))
        {
            out.push(file);
        }
    }
}

fn head(path: &Path) -> Option<Vec<u8>> {
    let mut bytes = Vec::new();
    std::fs::File::open(path).ok()?.take(HEAD).read_to_end(&mut bytes).ok()?;
    Some(bytes)
}

fn newest_first(files: &mut [Found]) {
    files.sort_by(|a, b| b.modified.cmp(&a.modified).then_with(|| a.id.cmp(&b.id)));
}

/// Codex rollouts whose first `session_meta` names `project` as the folder,
/// newest first, with the head read for each so a title can be taken.
fn codex_matches(homes: &Homes, project: &Path, only: Option<&str>) -> Vec<(Found, Vec<u8>)> {
    let mut files = Vec::new();
    walk_codex(&homes.codex.join("sessions"), 0, &mut files);
    files.retain(|f| only.is_none_or(|id| f.id == id));
    newest_first(&mut files);
    let mut out = Vec::new();
    for file in files.into_iter().take(CODEX_OPENED) {
        let Some(bytes) = head(&file.path) else { continue };
        if codex_cwd(&bytes).is_some_and(|cwd| cwd == project) {
            out.push((file, bytes));
            if out.len() >= LIMIT {
                break;
            }
        }
    }
    out
}

/// Whether `provider` holds a transcript of `id` that belongs to `project`.
pub(crate) fn belongs_to(provider: &str, homes: &Homes, project: &Path, id: &str) -> bool {
    if !valid_id(id) {
        return false;
    }
    match provider {
        "claude" => claude_files(homes, project).iter().any(|f| f.id == id),
        "codex" => !codex_matches(homes, project, Some(id)).is_empty(),
        _ => false,
    }
}

/// Up to 30 conversations for `project`, newest first.
pub(crate) fn list(homes: &Homes, project: &Path) -> Vec<Value> {
    let mut claude = claude_files(homes, project);
    newest_first(&mut claude);
    claude.truncate(LIMIT);
    let mut all: Vec<(Found, String)> = claude
        .into_iter()
        .filter_map(|f| head(&f.path).map(|bytes| (claude_title(&bytes), f)))
        .map(|(title, f)| (f, title))
        .collect();
    all.extend(
        codex_matches(homes, project, None)
            .into_iter()
            .map(|(f, bytes)| {
                let title = codex_title(&bytes);
                (f, title)
            }),
    );
    all.sort_by(|a, b| b.0.modified.cmp(&a.0.modified).then_with(|| a.0.id.cmp(&b.0.id)));
    all.truncate(LIMIT);
    all.into_iter()
        .map(|(f, title)| {
            let at = chrono::DateTime::<chrono::Utc>::from(f.modified);
            json!({"provider":f.provider,"id":f.id,"title":title,"size":f.size,
                "updatedAt":at.to_rfc3339_opts(chrono::SecondsFormat::Secs, true)})
        })
        .collect()
}

impl Engine {
    pub(crate) fn agent_sessions(&self, params: &Value) -> Result<Value, String> {
        let project = self.project(params)?;
        Ok(json!({"sessions": list(&self.homes, &project.path)}))
    }
}

/// The `resume: {provider, id}` of a `session.create`: its shape only, checked
/// against the terminal kind. `None` when the request does not resume anything.
pub(crate) fn resume_request<'a>(params: &'a Value, kind: &str) -> Result<Option<&'a str>, String> {
    let Some(resume) = params.get("resume").filter(|v| !v.is_null()) else {
        return Ok(None);
    };
    let provider = text(resume, "provider")?;
    let id = text(resume, "id")?;
    if !matches!(provider, "claude" | "codex") || provider != kind {
        return Err("resume provider must be claude or codex, matching kind".into());
    }
    if !valid_id(id) {
        return Err("resume id must be a conversation UUID".into());
    }
    Ok(Some(id))
}

#[cfg(test)]
#[path = "agent_history_tests.rs"]
mod tests;
