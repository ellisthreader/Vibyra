//! The project briefing the chat system prompt splices in.
//!
//! `vibyra-core` writes the text. Only the shell crate can reach the PTY
//! manager's open panes and the user's memory, so this composes those in and
//! caches the answer — module level, not on `AppState`, which is full and
//! owns process-lifetime state rather than a scratch map.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Deserialize;
use tauri::State;
use vibyra_core::brief::{self, BriefInput};
use vibyra_core::memory::{load_connected_vault, search_vault};
use vibyra_core::pty::SessionInfo;

use crate::state::AppState;

use super::run_blocking;

/// Already the wire type: `{ text, shape, codebase, chars, truncated }`.
pub type ProjectBrief = brief::Brief;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BriefProject {
    pub id: String,
    pub name: String,
    pub root: String,
}

/// Collapses a burst of chat turns onto one `git status`, while still
/// noticing a branch switch between two questions.
#[cfg(not(test))]
const LIVE_TTL: Duration = Duration::from_secs(15);
#[cfg(test)]
const LIVE_TTL: Duration = Duration::from_millis(120);

/// How long an entry nobody has asked about may keep its slot.
#[cfg(not(test))]
const ENTRY_TTL: Duration = Duration::from_secs(600);
#[cfg(test)]
const ENTRY_TTL: Duration = Duration::from_millis(900);

const MAX_ROOTS: usize = 8;
const MAX_TERMINALS: usize = 8;
const MAX_SNIPPETS: usize = 3;

struct Entry {
    root: PathBuf,
    brief: ProjectBrief,
    built: Instant,
}

static CACHE: OnceLock<Mutex<Vec<Entry>>> = OnceLock::new();

#[tauri::command]
pub async fn project_brief(
    state: State<'_, AppState>,
    project: BriefProject,
    query: Option<String>,
) -> Result<ProjectBrief, String> {
    let BriefProject { id, name, root } = project;
    let root = PathBuf::from(root);
    // Answer a hit before any disk work: the vault search reads up to a thousand notes.
    if let Some(hit) = cached(&cache_key(&root)) {
        return Ok(hit);
    }
    let sessions = state.manager.list();
    let store = super::memory::source_store_path(&state);
    let vault_key = super::memory::project_key(Some(id.clone()));
    // The reader `load_memory` already exposes, so the brief reads the same
    // file the Memory editor writes. It takes `state`, so it goes last.
    let notes = super::ai_memory::load_memory(state, Some(id)).await?;
    run_blocking(move || {
        let terminals = terminal_lines(&sessions, &root);
        let memory = memory_text(notes, &store, &vault_key, query.as_deref());
        Ok(build_cached(&name, &root, terminals, memory))
    })
    .await
}

fn build_cached(
    name: &str,
    root: &Path,
    terminals: Vec<String>,
    memory: Option<String>,
) -> ProjectBrief {
    let key = cache_key(root);
    if let Some(hit) = cached(&key) {
        return hit;
    }
    let brief = brief::build(&BriefInput {
        name,
        root,
        terminals,
        memory,
    });
    remember(&key, &brief);
    brief
}

/// One compact line per pane inside this project. Scrollback is deliberately
/// absent: the brief says what is open, never what it printed.
fn terminal_lines(sessions: &[SessionInfo], root: &Path) -> Vec<String> {
    let root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let mut lines = Vec::new();
    for session in sessions {
        if lines.len() >= MAX_TERMINALS {
            break;
        }
        let Some(folder) = folder_inside(session.cwd.as_deref(), &root) else {
            continue;
        };
        let agent = if session.agent_id.is_empty() {
            "terminal"
        } else {
            session.agent_id.as_str()
        };
        let exited = if session.alive { "" } else { " (exited)" };
        lines.push(format!("{} — {agent} in {folder}{exited}", session.title));
    }
    lines
}

/// Where a pane works, relative to the project; nothing if it is elsewhere.
fn folder_inside(cwd: Option<&str>, root: &Path) -> Option<String> {
    let cwd = Path::new(cwd?).canonicalize().ok()?;
    let relative = cwd.strip_prefix(root).ok()?;
    if relative.as_os_str().is_empty() {
        return Some(".".to_string());
    }
    Some(relative.to_string_lossy().into_owned())
}

/// The project's memory file first, then vault snippets when there is a query.
fn memory_text(notes: String, store: &Path, project: &str, query: Option<&str>) -> Option<String> {
    let mut parts = Vec::new();
    if !notes.trim().is_empty() {
        parts.push(notes.trim().to_string());
    }
    let query = query.map(str::trim).filter(|query| !query.is_empty());
    if let (Some(query), Ok(Some(vault))) = (query, load_connected_vault(store, project)) {
        let found = search_vault(&vault, query).unwrap_or_default();
        for snippet in found.into_iter().take(MAX_SNIPPETS) {
            parts.push(format!(
                "From {}:\n{}",
                snippet.path,
                snippet.content.trim()
            ));
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("\n\n"))
}

fn cache() -> &'static Mutex<Vec<Entry>> {
    CACHE.get_or_init(|| Mutex::new(Vec::new()))
}

fn cache_key(root: &Path) -> PathBuf {
    root.canonicalize().unwrap_or_else(|_| root.to_path_buf())
}

fn cached(key: &Path) -> Option<ProjectBrief> {
    let mut entries = cache().lock();
    entries.retain(|entry| entry.built.elapsed() < ENTRY_TTL);
    let found = entries.iter().position(|entry| entry.root == key)?;
    if entries[found].built.elapsed() >= LIVE_TTL {
        return None;
    }
    // Move the hit to the back; the map drops from the front.
    let entry = entries.remove(found);
    let brief = entry.brief.clone();
    entries.push(entry);
    Some(brief)
}

fn remember(key: &Path, brief: &ProjectBrief) {
    let mut entries = cache().lock();
    entries.retain(|entry| entry.root != key && entry.built.elapsed() < ENTRY_TTL);
    entries.push(Entry {
        root: key.to_path_buf(),
        brief: brief.clone(),
        built: Instant::now(),
    });
    while entries.len() > MAX_ROOTS {
        entries.remove(0);
    }
}

#[cfg(test)]
#[path = "project_brief_tests.rs"]
mod tests;
