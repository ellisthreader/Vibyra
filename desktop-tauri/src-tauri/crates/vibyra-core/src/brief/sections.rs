//! Every section of the brief, rendered at full length. Nothing here cuts:
//! `budget` owns the caps, so a section can say the whole truth and one place
//! decides what fits.

use std::path::Path;

use crate::fsx::{self, DirEntryInfo};
use crate::preview::PreviewTarget;

use super::{BriefInput, Shape};

const PRESENCE_ONLY: [&str; 2] = ["Cargo.toml", "pyproject.toml"];
const RECIPE_FILES: [[&str; 2]; 2] = [["Makefile", "makefile"], ["justfile", "Justfile"]];

pub(super) fn identity(input: &BriefInput, shape: Shape) -> String {
    let (name, path) = (input.name, input.root.display());
    if shape != Shape::Repository {
        return format!("Project: {name} at {path}. A folder, not a Git repository.");
    }
    let mut line = format!("Project: {name} at {path}.");
    let Ok(inventory) = fsx::worktrees::inventory(&input.root.to_string_lossy()) else {
        return format!("{line} It is a Git repository.");
    };
    if let Some(repository) = &inventory.repository {
        line.push_str(&format!(" GitHub repository {repository}."));
    }
    // The inventory covers every worktree of the repository; the deepest root
    // this project sits under is the one it is checked out in.
    let here = input.root.canonicalize().ok();
    let tree = inventory
        .worktrees
        .iter()
        .filter(|tree| here.as_deref().is_some_and(|p| p.starts_with(&tree.root)))
        .max_by_key(|tree| tree.root.len());
    match tree {
        Some(tree) => {
            let upstream = tree.upstream.as_deref();
            let tracking =
                upstream.map_or_else(|| "no upstream".into(), |u| format!("tracking {u}"));
            line.push_str(&format!(" Branch {} ({tracking}).", tree.branch));
        }
        None => line.push_str(" It is a Git repository."),
    }
    line
}

pub(super) fn stack(targets: &[PreviewTarget], scripts: &str) -> String {
    if targets.is_empty() {
        // Saying nothing here is what let the chat guess a build command.
        if scripts.is_empty() {
            return "Stack: not detected. Do not assume a build or test command; ask.".into();
        }
        return String::new();
    }
    let mut parts = Vec::new();
    for target in targets.iter().take(6) {
        let mut part = target.framework.clone();
        if target.relative_root != "." {
            part.push_str(&format!(" in {}", target.relative_root));
        }
        if let Some(command) = &target.command {
            part.push_str(&format!(" ({command})"));
        }
        parts.push(part);
    }
    format!("Stack: {}.", parts.join("; "))
}

/// The highest-leverage line in the brief: a model that can see `verify` and
/// `app:dev` stops inventing `ls -la`.
pub(super) fn scripts(root: &Path, entries: &[DirEntryInfo]) -> String {
    let mut parts = Vec::new();
    let keys = package_scripts(root);
    if !keys.is_empty() {
        parts.push(format!("package.json — {}", keys.join(", ")));
    }
    for names in RECIPE_FILES {
        // Match the real directory listing, so a case-insensitive disk cannot
        // report the same file twice under two spellings.
        let found = entries
            .iter()
            .find(|entry| !entry.is_dir && names.contains(&entry.name.as_str()));
        let Some(entry) = found else { continue };
        let recipes = recipe_names(&read_text(&root.join(&entry.name)));
        if !recipes.is_empty() {
            parts.push(format!("{} — {}", entry.name, recipes.join(", ")));
        }
    }
    let mut present = Vec::new();
    for name in PRESENCE_ONLY {
        if entries.iter().any(|entry| entry.name == name) {
            present.push(name);
        }
    }
    if !present.is_empty() {
        parts.push(format!("{} present", present.join(" and ")));
    }
    if parts.is_empty() {
        return String::new();
    }
    format!("Scripts: {}.", parts.join("; "))
}

pub(super) fn layout(entries: &[DirEntryInfo]) -> String {
    if entries.is_empty() {
        return String::new();
    }
    let mut names = Vec::new();
    for entry in entries.iter().take(40) {
        if entry.is_dir {
            names.push(format!("{}/", entry.name));
        } else {
            names.push(entry.name.clone());
        }
    }
    let count = entries.len();
    let word = if count == 1 { "entry" } else { "entries" };
    format!("Top level ({count} {word}): {}.", names.join(", "))
}

pub(super) fn terminals(lines: &[String]) -> String {
    let mut open = Vec::new();
    for line in lines {
        if !line.trim().is_empty() {
            open.push(line.trim());
        }
    }
    if open.is_empty() {
        return String::new();
    }
    format!("Open terminals:\n- {}", open.join("\n- "))
}

pub(super) fn memory(text: Option<&str>) -> String {
    let text = text.unwrap_or_default().trim();
    if text.is_empty() {
        return String::new();
    }
    format!("Project memory:\n{text}")
}

/// Keys only. A script body can carry paths, tokens and shell the model has no
/// business seeing, and the key alone is what stops an invented command.
fn package_scripts(root: &Path) -> Vec<String> {
    let text = read_text(&root.join("package.json"));
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Vec::new();
    };
    value
        .get("scripts")
        .and_then(|scripts| scripts.as_object())
        .map(|scripts| scripts.keys().take(40).cloned().collect())
        .unwrap_or_default()
}

/// Make targets and just recipes share a shape: a name at column zero, then a
/// colon. Assignments (`FOO := bar`) and indented command lines are not recipes.
fn recipe_names(text: &str) -> Vec<String> {
    let mut names: Vec<String> = Vec::new();
    for line in text.lines().take(2_000) {
        if line.starts_with([' ', '\t', '#', '.', '@']) || names.len() >= 24 {
            continue;
        }
        let Some((head, rest)) = line.split_once(':') else {
            continue;
        };
        if rest.starts_with('=') || head.contains('=') {
            continue;
        }
        let name = head.split_whitespace().next().unwrap_or_default();
        let named = !name.is_empty()
            && name
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || b"-_./".contains(&byte));
        if named && !names.iter().any(|known| known == name) {
            names.push(name.to_string());
        }
    }
    names
}

fn read_text(path: &Path) -> String {
    fsx::read_file_preview(&path.to_string_lossy(), 256 * 1024)
        .map(|preview| preview.content)
        .unwrap_or_default()
}
