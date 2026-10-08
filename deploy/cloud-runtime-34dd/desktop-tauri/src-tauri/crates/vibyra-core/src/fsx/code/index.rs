//! A columnar list of every file under a root: Git's own list (so ignored
//! files stay out) or, outside Git, a bounded walk that skips build output.

use std::collections::HashMap;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};

use super::CodeIndex;
use crate::fsx::git_changes::git;
use crate::{CoreError, CoreResult};

pub(super) const MAX_ENTRIES: usize = 100_000;
pub(super) const MAX_DEPTH: usize = 24;
const GIT_LIST_BYTES: usize = 24 * 1024 * 1024;
const CANCEL_EVERY: usize = 512;
const SKIPPED: &[&str] = &[
    ".cache",
    ".expo",
    ".git",
    ".next",
    ".turbo",
    ".vite",
    ".vibyra-agent",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "target",
    ".venv",
    "venv",
];

struct Builder<'a> {
    index: CodeIndex,
    cap: usize,
    cancel: &'a AtomicBool,
    seen: usize,
}

impl Builder<'_> {
    /// Adds an entry, or marks the index truncated when it is full.
    fn push(&mut self, name: String, parent: i32, kind: u8, size: u64) -> CoreResult<Option<i32>> {
        self.seen += 1;
        if self.seen.is_multiple_of(CANCEL_EVERY) && self.cancel.load(Ordering::Relaxed) {
            return Err(CoreError::Task("Cancelled".into()));
        }
        if self.index.names.len() >= self.cap {
            self.index.truncated = true;
            return Ok(None);
        }
        self.index.names.push(name);
        self.index.parents.push(parent);
        self.index.kinds.push(kind);
        self.index.sizes.push(size);
        Ok(Some(self.index.names.len() as i32 - 1))
    }
}

/// Every file under `root`, stopping early when `cancel` is set.
pub fn build_index(root: &Path, cancel: &AtomicBool) -> CoreResult<CodeIndex> {
    build_capped(root, cancel, MAX_ENTRIES)
}

pub(super) fn build_capped(root: &Path, cancel: &AtomicBool, cap: usize) -> CoreResult<CodeIndex> {
    let root = root.canonicalize()?;
    if !root.is_dir() {
        return Err(CoreError::InvalidPath(
            "This folder no longer exists.".into(),
        ));
    }
    let name = root.file_name().map_or_else(
        || root.to_string_lossy().into_owned(),
        |name| name.to_string_lossy().into_owned(),
    );
    let mut builder = Builder {
        index: CodeIndex {
            root: root.to_string_lossy().into_owned(),
            ..CodeIndex::default()
        },
        cap: cap.max(1),
        cancel,
        seen: 0,
    };
    builder.push(name, -1, 1, 0)?;
    let listed = crate::fsx::git_memo::toplevel(&root).and_then(|_| {
        let args = ["ls-files", "-co", "--exclude-standard", "-z", "--", "."];
        git(&root, &args, GIT_LIST_BYTES)
    });
    match listed {
        Ok(list) => from_git(&mut builder, &root, &list)?,
        Err(_) => walk(&mut builder, &root)?,
    }
    Ok(builder.index)
}

/// Builds folders from each listed path's components, parents first.
fn from_git(builder: &mut Builder, root: &Path, list: &str) -> CoreResult<()> {
    let mut dirs: HashMap<&str, i32> = HashMap::new();
    let mut previous = "";
    for path in list.split('\0').filter(|p| !p.is_empty()) {
        // Unmerged files are listed once per stage, next to each other.
        if path == previous {
            continue;
        }
        previous = path;
        if path.split('/').count() > MAX_DEPTH {
            builder.index.truncated = true;
            continue;
        }
        let mut parent = 0;
        let mut start = 0;
        for (at, _) in path.match_indices('/') {
            let dir = &path[..at];
            parent = match dirs.get(dir) {
                Some(&index) => index,
                None => {
                    let Some(index) = builder.push(path[start..at].into(), parent, 1, 0)? else {
                        return Ok(());
                    };
                    dirs.insert(dir, index);
                    index
                }
            };
            start = at + 1;
        }
        let meta = std::fs::symlink_metadata(root.join(path)).ok();
        let kind = u8::from(meta.as_ref().is_some_and(|m| m.is_dir()));
        let size = meta.filter(|m| !m.is_dir()).map_or(0, |m| m.len());
        if builder
            .push(path[start..].into(), parent, kind, size)?
            .is_none()
        {
            return Ok(());
        }
    }
    Ok(())
}

/// Depth-first walk that never follows symlinks and skips build output.
fn walk(builder: &mut Builder, root: &Path) -> CoreResult<()> {
    let mut stack = vec![(root.to_path_buf(), 0i32, 0usize)];
    while let Some((dir, parent, depth)) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            let name = entry.file_name().to_string_lossy().into_owned();
            if kind.is_dir() {
                if SKIPPED.iter().any(|skip| skip.eq_ignore_ascii_case(&name)) {
                    continue;
                }
                if depth + 1 > MAX_DEPTH {
                    builder.index.truncated = true;
                    continue;
                }
                let Some(index) = builder.push(name, parent, 1, 0)? else {
                    return Ok(());
                };
                stack.push((entry.path(), index, depth + 1));
            } else {
                let size = entry.metadata().map_or(0, |meta| meta.len());
                if builder.push(name, parent, 0, size)?.is_none() {
                    return Ok(());
                }
            }
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
