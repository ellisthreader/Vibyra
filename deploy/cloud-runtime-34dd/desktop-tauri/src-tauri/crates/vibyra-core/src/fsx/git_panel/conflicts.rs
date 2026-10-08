//! A minimal merge-conflict resolver: ours, theirs or both per hunk. A file
//! listed as unmerged by Git is read through the code view's reader, rewritten
//! through its hash-checked atomic writer (inside the root), then staged.
use super::conflict_parse::{hunk_count, parse, Segment};
use super::{unmerged, GitResult};
use crate::fsx::code::{read_file, write_file, CONFLICT_PREFIX};
use crate::fsx::ship::git::git;
use crate::fsx::ship::ShipError;
use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Choice {
    Ours,
    Theirs,
    Both,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictDoc {
    pub path: String,
    /// Hash of the file as read; resolving quotes it back.
    pub hash: String,
    pub segments: Vec<Segment>,
    pub hunks: usize,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resolved {
    pub path: String,
    /// Files still unmerged after this one was staged.
    pub remaining: usize,
}

/// Unmerged files under `root`, at most 100.
pub fn list_conflicts(root: &Path) -> GitResult<Vec<String>> {
    let mut files = unmerged(root)?;
    files.truncate(100);
    Ok(files)
}

/// Only a path Git itself lists as unmerged can be read or resolved here.
fn listed(root: &Path, path: &str) -> GitResult<()> {
    if unmerged(root)?.iter().any(|file| file == path) {
        Ok(())
    } else {
        Err(ShipError::new("That file is not in a merge conflict."))
    }
}

fn load(root: &Path, path: &str) -> GitResult<(String, Vec<Segment>)> {
    listed(root, path)?;
    let file = read_file(root, path).map_err(|e| ShipError::new(e.to_string()))?;
    if file.binary || file.lossy || file.read_only {
        return Err(ShipError::new(
            "This file cannot be resolved here. Use a terminal.",
        ));
    }
    let segments = parse(&file.text)?;
    if hunk_count(&segments) == 0 {
        return Err(ShipError::new(
            "This conflict has no text markers (one side deleted it). Resolve it in a terminal.",
        ));
    }
    Ok((file.hash, segments))
}

pub fn read_conflict(root: &Path, path: &str) -> GitResult<ConflictDoc> {
    let (hash, segments) = load(root, path)?;
    Ok(ConflictDoc {
        path: path.to_string(),
        hash,
        hunks: hunk_count(&segments),
        segments,
    })
}

pub fn resolve_conflict(
    root: &Path,
    path: &str,
    expected_hash: &str,
    choices: &[Choice],
) -> GitResult<Resolved> {
    let (hash, segments) = load(root, path)?;
    if !hash.eq_ignore_ascii_case(expected_hash) {
        return Err(ShipError::new(format!("{CONFLICT_PREFIX}{hash}")));
    }
    if choices.len() != hunk_count(&segments) {
        return Err(ShipError::new(
            "Choose ours, theirs or both for every conflict first.",
        ));
    }
    let mut picks = choices.iter();
    let mut out = String::new();
    for segment in &segments {
        match segment {
            Segment::Text { text } => out.push_str(text),
            Segment::Conflict { ours, theirs, .. } => match picks.next() {
                Some(Choice::Ours) => out.push_str(ours),
                Some(Choice::Theirs) => out.push_str(theirs),
                _ => {
                    out.push_str(ours);
                    out.push_str(theirs);
                }
            },
        }
    }
    write_file(root, path, &out, Some(&hash)).map_err(|e| ShipError::new(e.to_string()))?;
    git(root, &["add", "--", path])?;
    Ok(Resolved {
        path: path.to_string(),
        remaining: unmerged(root)?.len(),
    })
}
