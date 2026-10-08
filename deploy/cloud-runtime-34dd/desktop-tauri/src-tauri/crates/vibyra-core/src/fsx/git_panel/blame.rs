//! Who last changed each line of one file, read-only and bounded. The file is
//! resolved inside the root first (no `..`, no links out, nothing in `.git`).
use super::GitResult;
use crate::fsx::code::resolve_in_root;
use crate::fsx::ship::git::git;
use crate::fsx::ship::ShipError;
use serde::Serialize;
use std::path::Path;

pub const MAX_LINES: usize = 5_000;
const MAX_BYTES: u64 = 2 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlameCommit {
    pub hash: String,
    pub author: String,
    pub time_ms: u64,
    pub summary: String,
    /// Changes in the working copy that are not in any commit yet.
    pub uncommitted: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Blame {
    pub commits: Vec<BlameCommit>,
    /// One entry per line of the file: an index into `commits`.
    pub lines: Vec<u32>,
}

fn refuse(message: &str) -> ShipError {
    ShipError::new(message)
}

pub fn blame(root: &Path, path: &str) -> GitResult<Blame> {
    let file = resolve_in_root(root, path, false).map_err(|e| refuse(&e.to_string()))?;
    let meta = std::fs::metadata(&file).map_err(|_| refuse("This file no longer exists."))?;
    if meta.len() > MAX_BYTES {
        return Err(refuse("This file is too large to blame."));
    }
    let canon_root = root
        .canonicalize()
        .map_err(|_| refuse("This folder no longer exists."))?;
    let rel = file
        .strip_prefix(&canon_root)
        .map_err(|_| refuse("This file is outside the project folder."))?;
    let rel = rel.to_string_lossy();
    let out = git(&canon_root, &["blame", "--porcelain", "--", &rel])
        .map_err(|_| refuse("This file has no Git history yet."))?;
    parse(&String::from_utf8_lossy(&out))
}

fn parse(output: &str) -> GitResult<Blame> {
    let mut blame = Blame::default();
    let mut index_of = std::collections::HashMap::<String, u32>::new();
    let mut current: Option<(String, usize)> = None;
    let mut pending: Option<BlameCommit> = None;
    for line in output.lines() {
        if let Some(_content) = line.strip_prefix('\t') {
            let Some((hash, final_line)) = current.take() else {
                continue;
            };
            if final_line == 0 || final_line > MAX_LINES {
                return Err(refuse("This file has too many lines to blame."));
            }
            let slot = match index_of.get(&hash) {
                Some(slot) => *slot,
                None => {
                    let mut commit = pending.take().unwrap_or_else(|| BlameCommit {
                        hash: hash.chars().take(8).collect(),
                        author: String::new(),
                        time_ms: 0,
                        summary: String::new(),
                        uncommitted: false,
                    });
                    commit.uncommitted = hash.bytes().all(|b| b == b'0');
                    blame.commits.push(commit);
                    index_of.insert(hash, blame.commits.len() as u32 - 1);
                    blame.commits.len() as u32 - 1
                }
            };
            if blame.lines.len() < final_line {
                blame.lines.resize(final_line, slot);
            }
            blame.lines[final_line - 1] = slot;
        } else if current.is_none() {
            let mut parts = line.split(' ');
            let hash = parts.next().unwrap_or("");
            let _original = parts.next();
            let final_line = parts.next().and_then(|n| n.parse::<usize>().ok());
            if hash.len() >= 40 && hash.bytes().all(|b| b.is_ascii_hexdigit()) {
                if let Some(final_line) = final_line {
                    current = Some((hash.to_string(), final_line));
                    if !index_of.contains_key(hash) {
                        pending = Some(BlameCommit {
                            hash: hash.chars().take(8).collect(),
                            author: String::new(),
                            time_ms: 0,
                            summary: String::new(),
                            uncommitted: false,
                        });
                    }
                }
            }
        } else if let Some(commit) = pending.as_mut() {
            if let Some(author) = line.strip_prefix("author ") {
                commit.author = author
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(80)
                    .collect();
            } else if let Some(time) = line.strip_prefix("author-time ") {
                commit.time_ms = time.parse::<u64>().unwrap_or(0) * 1000;
            } else if let Some(summary) = line.strip_prefix("summary ") {
                commit.summary = summary
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(160)
                    .collect();
            }
        }
    }
    Ok(blame)
}
