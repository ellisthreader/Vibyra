//! The list of configured servers, in its own private file next to settings.json
//! (never inside it: the settings page saves the whole settings object and must
//! not be able to overwrite these).

use super::error::McpError;
use super::limits::MAX_SERVERS;
use super::spec::ServerSpec;
use crate::fsx::{harden, write_private_atomic};
use std::path::{Path, PathBuf};

pub const FILE: &str = "local-mcp.json";

pub fn path_in(dir: &Path) -> PathBuf {
    dir.join(FILE)
}

/// A missing or unreadable file is an empty list; one bad entry never hides the rest.
pub fn load(dir: &Path) -> Vec<ServerSpec> {
    let path = path_in(dir);
    harden(&path);
    let Ok(raw) = std::fs::read_to_string(&path) else {
        return Vec::new();
    };
    let Ok(items) = serde_json::from_str::<Vec<serde_json::Value>>(&raw) else {
        return Vec::new();
    };
    items
        .into_iter()
        .filter_map(|v| serde_json::from_value::<ServerSpec>(v).ok())
        .filter(|spec| spec.validate().is_ok())
        .take(MAX_SERVERS)
        .collect()
}

pub fn save(dir: &Path, specs: &[ServerSpec]) -> Result<(), McpError> {
    std::fs::create_dir_all(dir).map_err(|e| McpError::Invalid(e.to_string()))?;
    let raw = serde_json::to_vec_pretty(specs).map_err(|e| McpError::Invalid(e.to_string()))?;
    write_private_atomic(&path_in(dir), &raw).map_err(|e| McpError::Invalid(e.to_string()))
}

/// Adds or replaces one server (by id), refusing an eleventh.
pub fn upsert(dir: &Path, spec: ServerSpec) -> Result<Vec<ServerSpec>, McpError> {
    spec.validate()?;
    let mut specs = load(dir);
    if let Some(existing) = specs.iter_mut().find(|s| s.id == spec.id) {
        *existing = spec;
    } else if specs.len() >= MAX_SERVERS {
        return Err(McpError::Invalid(format!(
            "At most {MAX_SERVERS} servers. Remove one first."
        )));
    } else {
        specs.push(spec);
    }
    save(dir, &specs)?;
    Ok(specs)
}

pub fn remove(dir: &Path, id: &str) -> Result<Vec<ServerSpec>, McpError> {
    let mut specs = load(dir);
    specs.retain(|s| s.id != id);
    save(dir, &specs)?;
    Ok(specs)
}
