//! F-31: a folder grant puts everything under the folder in front of the AI model. The home directory, a
//! filesystem root and the broad folders directly under home (Desktop, Documents ...) are not one project:
//! they need an extra, explicit confirmation and are only ever granted read-only.
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[cfg(all(test, unix))]
#[path = "agent_computer_breadth_tests.rs"]
mod tests;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Breadth {
    Home,
    Root,
    Broad,
}

impl Breadth {
    pub fn as_str(self) -> &'static str {
        match self {
            Breadth::Home => "home",
            Breadth::Root => "root",
            Breadth::Broad => "broad",
        }
    }
}

#[derive(Debug, PartialEq, Eq)]
pub enum Gate {
    Proceed,
    Ask(Breadth),
    ReadOnly,
}

/// Folders directly under home that hold a lot more than one project.
const HOME_CHILDREN: [&str; 13] = [
    "Desktop",
    "Documents",
    "Downloads",
    "Library",
    "Pictures",
    "Movies",
    "Music",
    "Public",
    "Applications",
    "Videos",
    "Dropbox",
    "OneDrive",
    "Google Drive",
];
/// Directly under a filesystem root: system trees and mount points, never one project.
const ROOT_CHILDREN: [&str; 26] = [
    "Volumes",
    "mnt",
    "media",
    "opt",
    "usr",
    "var",
    "etc",
    "tmp",
    "private",
    "Applications",
    "Library",
    "System",
    "bin",
    "sbin",
    "dev",
    "proc",
    "sys",
    "root",
    "srv",
    "lib",
    "boot",
    "Users",
    "home",
    "Windows",
    "Program Files",
    "ProgramData",
];
/// The children of these are whole disks or other people's accounts.
const DISK_PARENTS: [&str; 5] = ["Volumes", "mnt", "media", "Users", "home"];
const WINDOW: Duration = Duration::from_secs(600);

fn listed(list: &[&str], name: &str) -> bool {
    list.iter().any(|item| item.eq_ignore_ascii_case(name))
}

fn name(path: &Path) -> Option<&str> {
    path.file_name().and_then(|name| name.to_str())
}

/// Pure path logic on a canonical path; `home` is the person's home directory when known.
pub fn classify(path: &Path, home: Option<&Path>) -> Option<Breadth> {
    let Some(parent) = path.parent() else {
        return Some(Breadth::Root);
    };
    if let Some(home) = home {
        if path == home {
            return Some(Breadth::Home);
        }
        if home.starts_with(path) {
            return Some(Breadth::Broad);
        }
        if parent == home
            && name(path).is_some_and(|n| n.starts_with('.') || listed(&HOME_CHILDREN, n))
        {
            return Some(Breadth::Broad);
        }
    }
    let system = parent.parent().is_none() && name(path).is_some_and(|n| listed(&ROOT_CHILDREN, n));
    let disk = parent.parent().is_some_and(|up| up.parent().is_none())
        && name(parent).is_some_and(|n| listed(&DISK_PARENTS, n));
    (system || disk).then_some(Breadth::Broad)
}

pub fn gate(path: &Path, home: Option<&Path>, confirmed: bool) -> Gate {
    match classify(path, home) {
        None => Gate::Proceed,
        Some(_) if confirmed => Gate::ReadOnly,
        Some(kind) => Gate::Ask(kind),
    }
}

pub fn gate_here(path: &Path, confirmed: bool) -> Gate {
    let home = dirs::home_dir().map(|home| home.canonicalize().unwrap_or(home));
    gate(path, home.as_deref(), confirmed)
}

/// The one folder a broad answer asked about, kept for a single confirmation by the same teammate.
#[derive(Default)]
pub struct Pending(Mutex<Option<(String, PathBuf, Instant)>>);

impl Pending {
    pub fn remember(&self, agent: &str, path: PathBuf, now: Instant) {
        *self.0.lock() = Some((agent.to_owned(), path, now));
    }

    /// Spends the confirmation whatever the answer, so one broad answer allows exactly one grant.
    pub fn take(&self, agent: &str, now: Instant) -> Option<PathBuf> {
        let (owner, path, at) = self.0.lock().take()?;
        (owner == agent && now.saturating_duration_since(at) <= WINDOW).then_some(path)
    }

    pub fn clear(&self) {
        *self.0.lock() = None;
    }
}

static PENDING: Pending = Pending(Mutex::new(None));

/// The folder to grant and whether it is the one the person just confirmed: the pending broad folder
/// when they confirmed, otherwise whatever the native picker returns.
pub async fn pick(
    app: &AppHandle,
    agent_id: &str,
    allow_edits: bool,
    confirm_broad: bool,
) -> Result<(Option<PathBuf>, bool), String> {
    if confirm_broad {
        return match PENDING.take(agent_id, Instant::now()) {
            Some(path) => Ok((Some(path), true)),
            None => Err("That confirmation expired. Choose the folder again.".into()),
        };
    }
    PENDING.clear();
    let picker = app.clone();
    let selected = crate::commands::run_blocking(move || {
        Ok(picker
            .dialog()
            .file()
            .set_title(if allow_edits {
                "Allow this teammate to propose edits in a project folder"
            } else {
                "Allow this teammate to read a project folder"
            })
            .blocking_pick_folder()
            .and_then(|file| file.into_path().ok()))
    })
    .await?;
    Ok((selected, false))
}

/// Nothing is granted: keep the folder for one confirmation and tell the renderer what to ask.
pub fn ask(agent_id: &str, path: &Path, kind: Breadth) -> Value {
    PENDING.remember(agent_id, path.to_path_buf(), Instant::now());
    json!({"broad": kind.as_str(), "path": path.to_string_lossy(), "label": name(path).unwrap_or("Folder")})
}
