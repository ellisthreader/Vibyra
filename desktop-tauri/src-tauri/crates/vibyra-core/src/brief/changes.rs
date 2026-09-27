//! The working tree, said in a way that survives a 400-file repository.
//!
//! A list of 400 paths is not context, it is noise that crowds out the rest of
//! the brief. So the counts come first and are written first — the budgeter
//! cuts from the end, which is what keeps that one line safe — and only a
//! handful of paths follow it.

use std::path::Path;

use crate::fsx::{self, git_changes::ChangedFile};

use super::Shape;

/// Change buckets in the order a person triages them.
const BUCKETS: [&str; 4] = ["Conflicted", "Staged", "Modified", "Untracked"];
const MAX_PATHS: usize = 12;
const MAX_PATH_CHARS: usize = 80;

pub(super) fn section(root: &Path, shape: Shape) -> String {
    if shape != Shape::Repository {
        return "Not a Git repository, so there is no branch or change list to report.".into();
    }
    match fsx::git_changes::changes(&root.to_string_lossy()) {
        Ok(changes) => render(&changes.files),
        // One honest line beats a stale or invented status.
        Err(_) => "Working tree: Vibyra could not read Git here just now.".into(),
    }
}

pub(super) fn render(files: &[ChangedFile]) -> String {
    if files.is_empty() {
        return "Working tree: clean, nothing uncommitted.".into();
    }
    let mut counts = [0usize; 4];
    let mut sorted = Vec::with_capacity(files.len());
    for file in files {
        let bucket = bucket_of(&file.status);
        counts[bucket] += 1;
        // Shallow paths first, then alphabetical: an ordering the tests can
        // pin, and the one a person would skim.
        sorted.push((bucket, file.path.matches('/').count(), file.path.as_str()));
    }
    sorted.sort_unstable();

    let total = files.len();
    let mut lines = vec![format!(
        "Working tree: {total} changed {} — {} conflicted, {} staged, {} modified, {} untracked.",
        if total == 1 { "file" } else { "files" },
        counts[0],
        counts[1],
        counts[2],
        counts[3]
    )];
    let shown = total.min(MAX_PATHS);
    for (bucket, label) in BUCKETS.iter().enumerate() {
        let mut paths = Vec::new();
        for entry in &sorted[..shown] {
            if entry.0 == bucket {
                paths.push(elide(entry.2));
            }
        }
        if !paths.is_empty() {
            lines.push(format!("{label}: {}", paths.join(", ")));
        }
    }
    if total > shown {
        lines.push(format!("…{} more not listed.", total - shown));
    }
    lines.join("\n")
}

/// Porcelain v1 status to a bucket. A file that is both staged and modified
/// counts once, under the more urgent of the two.
fn bucket_of(status: &str) -> usize {
    let mut bytes = status.bytes();
    let (x, y) = (bytes.next().unwrap_or(b' '), bytes.next().unwrap_or(b' '));
    if x == b'U' || y == b'U' || (x == y && (x == b'A' || x == b'D')) {
        0
    } else if x == b'?' {
        3
    } else if x != b' ' {
        1
    } else {
        2
    }
}

/// A deep path spends its budget on directories that say nothing; both ends
/// are the parts that identify the file.
fn elide(path: &str) -> String {
    if path.len() <= MAX_PATH_CHARS {
        return path.to_string();
    }
    let half = (MAX_PATH_CHARS - 1) / 2;
    let mut head = half;
    while !path.is_char_boundary(head) {
        head -= 1;
    }
    let mut tail = path.len() - half;
    while !path.is_char_boundary(tail) {
        tail += 1;
    }
    format!("{}…{}", &path[..head], &path[tail..])
}
