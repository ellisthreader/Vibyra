//! Finding a project's env files: a bounded walk that skips build output and
//! dependency folders and never follows a link.

use std::path::Path;

use serde::Serialize;

use super::guard::{is_env_name, MAX_BYTES};

const SKIP: [&str; 14] = [
    "node_modules",
    ".git",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "vendor",
    ".venv",
    "venv",
    "__pycache__",
    ".cache",
    ".turbo",
    "Pods",
];
const MAX_DEPTH: usize = 3;
const MAX_FILES: usize = 40;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvFile {
    /// Relative to the project root, `/`-separated.
    pub path: String,
    pub size: u64,
    /// False for a file too large to edit safely here.
    pub editable: bool,
}

pub fn list(root: &Path) -> Vec<EnvFile> {
    let mut found = Vec::new();
    walk(root, "", 0, &mut found);
    found.sort_by(|a, b| {
        (a.path.matches('/').count(), &a.path).cmp(&(b.path.matches('/').count(), &b.path))
    });
    found
}

fn walk(dir: &Path, prefix: &str, depth: usize, found: &mut Vec<EnvFile>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        if found.len() >= MAX_FILES {
            return;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        // `file_type` does not follow links: a linked folder or file is skipped.
        let Ok(kind) = entry.file_type() else {
            continue;
        };
        let rel = format!("{prefix}{name}");
        if kind.is_file() && is_env_name(&name) {
            let size = entry.metadata().map_or(0, |m| m.len());
            found.push(EnvFile {
                path: rel,
                size,
                editable: size <= MAX_BYTES,
            });
        } else if kind.is_dir() && depth < MAX_DEPTH && !SKIP.contains(&name.as_str()) {
            walk(&entry.path(), &format!("{rel}/"), depth + 1, found);
        }
    }
}
