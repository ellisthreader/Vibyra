//! The env manager (Part 18): a project's `.env*` files, read and edited
//! inside the project root only.
//!
//! * Values stay native until asked for: `read` returns keys and value
//!   lengths, `reveal` returns one value. Nothing here logs or returns a value
//!   inside an error message.
//! * Writes go through the code view's atomic, hash-checked `write_file`, after
//!   a second hash comparison of our own, so an edit made elsewhere in the
//!   meantime is reported, never overwritten.
//! * These files are never synced (the cloud-sync denylist covers `.env*`, see
//!   `vibyra-sync`) and nothing in this module is reachable from a model tool.

mod edit;
mod guard;
mod list;
mod parse;

use std::path::Path;

use serde::Serialize;

use super::code::{self, CodeSaved};
use crate::{CoreError, CoreResult};
pub use list::{list, EnvFile};
use parse::{parse as parse_lines, split_lines, Quote};

/// What the panel may show about one entry. The value itself is not here.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvEntry {
    pub key: String,
    /// 1-based line the entry starts on.
    pub line: usize,
    pub exported: bool,
    pub quoted: bool,
    pub length: usize,
    /// The same key appears again later in the file (the last one wins).
    pub shadowed: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvDoc {
    pub path: String,
    pub hash: String,
    pub entries: Vec<EnvEntry>,
}

fn conflict(actual: &str) -> CoreError {
    CoreError::Task(format!("{}{actual}", code::CONFLICT_PREFIX))
}

fn load(root: &Path, rel: &str) -> CoreResult<(code::CodeFile, std::path::PathBuf)> {
    let file = guard::checked_file(root, rel)?;
    let doc = code::read_file(root, &file.to_string_lossy())?;
    if doc.binary || doc.lossy || doc.size > guard::MAX_BYTES {
        return Err(CoreError::InvalidPath(
            "This file is too large or not plain text.".into(),
        ));
    }
    Ok((doc, file))
}

pub fn read(root: &Path, rel: &str) -> CoreResult<EnvDoc> {
    let (doc, _) = load(root, rel)?;
    let lines = split_lines(&doc.text);
    let parsed = parse_lines(&lines);
    let entries = parsed
        .iter()
        .enumerate()
        .map(|(index, e)| EnvEntry {
            key: e.key.clone(),
            line: e.first + 1,
            exported: e.exported,
            quoted: e.quote != Quote::None,
            length: e.value.chars().count(),
            shadowed: parsed[index + 1..].iter().any(|later| later.key == e.key),
        })
        .collect();
    Ok(EnvDoc {
        path: rel.to_owned(),
        hash: doc.hash,
        entries,
    })
}

/// One value, the last of a repeated key.
pub fn reveal(root: &Path, rel: &str, key: &str) -> CoreResult<String> {
    let (doc, _) = load(root, rel)?;
    let lines = split_lines(&doc.text);
    parse_lines(&lines)
        .into_iter()
        .rev()
        .find(|e| e.key == key)
        .map(|e| e.value)
        .ok_or_else(|| CoreError::InvalidPath("That key is no longer in the file.".into()))
}

fn save(
    root: &Path,
    rel: &str,
    expected: &str,
    change: impl FnOnce(&str) -> Result<String, String>,
) -> CoreResult<CodeSaved> {
    let (doc, file) = load(root, rel)?;
    if !doc.hash.eq_ignore_ascii_case(expected) {
        return Err(conflict(&doc.hash));
    }
    let next = change(&doc.text).map_err(CoreError::InvalidPath)?;
    code::write_file(root, &file.to_string_lossy(), &next, Some(&doc.hash))
}

pub fn set(
    root: &Path,
    rel: &str,
    key: &str,
    value: &str,
    expected: &str,
) -> CoreResult<CodeSaved> {
    save(root, rel, expected, |text| edit::set(text, key, value))
}

pub fn delete(root: &Path, rel: &str, key: &str, expected: &str) -> CoreResult<CodeSaved> {
    save(root, rel, expected, |text| {
        edit::delete(text, key).ok_or_else(|| "That key is no longer in the file.".to_string())
    })
}

#[cfg(test)]
#[path = "tests.rs"]
mod tests;
