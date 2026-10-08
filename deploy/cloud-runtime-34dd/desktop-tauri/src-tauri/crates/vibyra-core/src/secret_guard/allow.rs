//! Which projects the person let an agent read sensitive files in. The list
//! lives in the settings directory, outside every project: an agent can write
//! inside a project, so a marker file there would be a bypass.
//! `<settings dir>/secret-guard.json` = `{"allow": ["<canonical project root>", ...]}`.

use super::sensitive_path;
use crate::fsx::{harden, write_private_atomic};
use crate::{CoreError, CoreResult};
use std::path::{Path, PathBuf};

pub const FILE: &str = "secret-guard.json";
pub const MAX_ROOTS: usize = 200;
pub const MAX_PATH_CHARS: usize = 1024;

fn file_in(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// The canonical form a root is stored and compared in; an unreadable path stays as given.
fn canonical(root: &str) -> String {
    Path::new(root)
        .canonicalize()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|_| root.to_owned())
}

/// A missing or unreadable file is an empty list (nothing allowed).
fn load(dir: &Path) -> Vec<String> {
    let path = file_in(dir);
    harden(&path);
    let Ok(raw) = std::fs::read_to_string(path) else {
        return Vec::new();
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) else {
        return Vec::new();
    };
    value["allow"]
        .as_array()
        .map(|roots| {
            roots
                .iter()
                .filter_map(|r| r.as_str())
                .filter(|r| r.chars().count() <= MAX_PATH_CHARS)
                .take(MAX_ROOTS)
                .map(str::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

pub fn is_allowed(settings_dir: &Path, root: &str) -> bool {
    let root = canonical(root);
    load(settings_dir).contains(&root)
}

pub fn set_allowed(settings_dir: &Path, root: &str, allowed: bool) -> CoreResult<()> {
    let root = canonical(root);
    if root.chars().count() > MAX_PATH_CHARS {
        return Err(CoreError::InvalidPath(
            "the project path is too long".into(),
        ));
    }
    let mut roots = load(settings_dir);
    roots.retain(|r| *r != root);
    if allowed {
        if roots.len() >= MAX_ROOTS {
            return Err(CoreError::Settings(format!(
                "At most {MAX_ROOTS} projects can be allowed."
            )));
        }
        roots.push(root);
    }
    std::fs::create_dir_all(settings_dir)?;
    let raw = serde_json::to_vec_pretty(&serde_json::json!({ "allow": roots }))
        .map_err(|e| CoreError::Settings(e.to_string()))?;
    write_private_atomic(&file_in(settings_dir), &raw)
}

/// True when a file tool must refuse `relative_path` in project `root`: a
/// sensitive name in a project the person has not allowed.
pub fn refuses(settings_dir: &Path, root: &str, relative_path: &str) -> bool {
    sensitive_path(relative_path) && !is_allowed(settings_dir, root)
}
