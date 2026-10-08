//! What the cloud computer changed, and readers for the three sides of a review (base, theirs, the Mac's last
//! uploaded snapshot; "ours" is simply the file on disk).
use crate::bundle::CLOUD_REF;
use crate::error::{Result, SyncError};
use crate::git::Git;
use crate::snapshot::SNAP_REF;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChangeStatus {
    Added,
    Modified,
    Deleted,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct FileChange {
    pub path: String,
    pub status: ChangeStatus,
    /// Git mode of the cloud's version (`100644`, `100755`); empty for a deletion.
    pub mode: String,
}

/// One cloud snapshot that arrived, relative to the common base with this Mac's last uploaded snapshot.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudChange {
    pub project_key: String,
    /// The cloud folder name.
    pub project: String,
    pub seq: u64,
    /// Commit at `refs/vibyra/cloud` (theirs).
    pub head: String,
    /// Common ancestor commit (base).
    pub base: Option<String>,
    pub files: Vec<FileChange>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// The common ancestor of the cloud snapshot and the Mac's last uploaded snapshot.
    Base,
    /// The cloud's snapshot.
    Theirs,
    /// The Mac's last uploaded snapshot.
    Snapshot,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TreeEntry {
    pub mode: String,
    pub sha: String,
}

/// Common ancestor of `head` and the Mac's snapshot ref; falls back to `fallback` (the last uploaded head).
pub fn find_base(shadow: &Path, head: &str, fallback: Option<&str>) -> Option<String> {
    let git = Git::shadow(shadow);
    git.try_text(&["merge-base", head, SNAP_REF])
        .or_else(|| fallback.map(str::to_string))
}

/// `git diff-tree` between `base` (or the empty tree) and `head`.
pub fn diff_files(shadow: &Path, base: Option<&str>, head: &str) -> Result<Vec<FileChange>> {
    let git = Git::shadow(shadow);
    let after = tree_map(&git, head)?;
    let before = match base {
        Some(b) => tree_map(&git, b)?,
        None => BTreeMap::new(),
    };
    let mut out = vec![];
    for (path, e) in &after {
        match before.get(path) {
            None => out.push(FileChange {
                path: path.clone(),
                status: ChangeStatus::Added,
                mode: e.mode.clone(),
            }),
            Some(b) if b != e => out.push(FileChange {
                path: path.clone(),
                status: ChangeStatus::Modified,
                mode: e.mode.clone(),
            }),
            _ => {}
        }
    }
    for path in before.keys().filter(|p| !after.contains_key(*p)) {
        out.push(FileChange {
            path: path.clone(),
            status: ChangeStatus::Deleted,
            mode: String::new(),
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

fn tree_map(git: &Git, rev: &str) -> Result<BTreeMap<String, TreeEntry>> {
    let raw = git.out(&["ls-tree", "-r", "-z", rev])?;
    let mut map = BTreeMap::new();
    for rec in String::from_utf8_lossy(&raw)
        .split('\0')
        .filter(|r| !r.is_empty())
    {
        let Some((meta, path)) = rec.split_once('\t') else {
            continue;
        };
        let mut p = meta.split_whitespace();
        if let (Some(mode), Some(_kind), Some(sha)) = (p.next(), p.next(), p.next()) {
            map.insert(
                path.to_string(),
                TreeEntry {
                    mode: mode.into(),
                    sha: sha.into(),
                },
            );
        }
    }
    Ok(map)
}

/// The full tree of a commit as `path -> (mode, blob sha)`.
pub fn read_tree(shadow: &Path, rev: &str) -> Result<BTreeMap<String, TreeEntry>> {
    tree_map(&Git::shadow(shadow), rev)
}

/// A blob's bytes at `rev:path`; `None` when the path is not in that tree.
pub fn read_blob(shadow: &Path, rev: &str, path: &str) -> Result<Option<Vec<u8>>> {
    if path.is_empty() || path.starts_with('/') || path.split('/').any(|p| p == ".." || p == ".") {
        return Err(SyncError::Invalid("unsafe path".into()));
    }
    let git = Git::shadow(shadow);
    if git
        .out(&["cat-file", "-e", &format!("{rev}:{path}")])
        .is_err()
    {
        return Ok(None);
    }
    git.out(&["cat-file", "blob", &format!("{rev}:{path}")])
        .map(Some)
}

/// The commit a ref points at, if any.
pub fn rev(shadow: &Path, refname: &str) -> Option<String> {
    Git::shadow(shadow).try_text(&[
        "rev-parse",
        "-q",
        "--verify",
        &format!("{refname}^{{commit}}"),
    ])
}

pub fn cloud_head(shadow: &Path) -> Option<String> {
    rev(shadow, CLOUD_REF)
}
