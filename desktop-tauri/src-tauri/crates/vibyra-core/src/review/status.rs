use std::path::Path;

use crate::CoreResult;

use super::{git_bytes, git_root, ChangeKind, ChangedFile, WorktreeStatus};

/// The list stays scannable and the IPC payload bounded; a worktree with more
/// changed files than this is reported as truncated, never trimmed silently.
const MAX_FILES: usize = 2_000;

/// Untracked files are counted by reading them; past this size the count is
/// skipped rather than paid for.
const MAX_COUNTED_BYTES: u64 = 1024 * 1024;

/// Everything the agent changed in `worktree` since `base` — tracked changes
/// from `git diff`, plus files it created that were never added.
///
/// Scoped to the whole checkout, not the project subfolder: a monorepo agent
/// that edits a shared file one level up is doing real work, and review used
/// to be blind to it.
pub fn worktree_status(worktree: &Path, base: &str) -> CoreResult<WorktreeStatus> {
    let root = git_root(worktree)?;
    let mut changed = tracked_changes(&root, base)?;
    let (untracked, untracked_cut) = untracked_files(&root)?;
    changed.extend(untracked);
    changed.sort_by(|a, b| a.path.cmp(&b.path));
    let truncated = untracked_cut || changed.len() > MAX_FILES;
    changed.truncate(MAX_FILES);
    Ok(WorktreeStatus { changed, truncated })
}

fn tracked_changes(worktree: &Path, base: &str) -> CoreResult<Vec<ChangedFile>> {
    let names = git_bytes(worktree, &["diff", "--name-status", "-z", base])?;
    let stats = git_bytes(worktree, &["diff", "--numstat", "-z", base])?;
    let counts = parse_numstat(&stats);
    Ok(parse_name_status(&names)
        .into_iter()
        .map(|(path, previous_path, kind)| {
            let (additions, deletions) = counts
                .iter()
                .find(|(counted, _, _)| *counted == path)
                .map(|(_, additions, deletions)| (*additions, *deletions))
                .unwrap_or((0, 0));
            ChangedFile {
                path,
                previous_path,
                kind,
                additions,
                deletions,
            }
        })
        .collect())
}

/// `--name-status -z` emits `STATUS\0path\0`, and for renames
/// `R<score>\0old\0new\0`. The new path is the one worth showing.
fn parse_name_status(raw: &[u8]) -> Vec<(String, Option<String>, ChangeKind)> {
    let mut fields = raw
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .map(|field| String::from_utf8_lossy(field).to_string());
    let mut entries = Vec::new();
    while let Some(status) = fields.next() {
        let Some(path) = fields.next() else { break };
        let kind = match status.chars().next() {
            Some('A') => ChangeKind::Added,
            Some('D') => ChangeKind::Deleted,
            Some('R') | Some('C') => {
                let renamed = fields.next().unwrap_or(path.clone());
                entries.push((renamed, Some(path), ChangeKind::Renamed));
                continue;
            }
            _ => ChangeKind::Modified,
        };
        entries.push((path, None, kind));
    }
    entries
}

/// `--numstat -z` emits `added\tdeleted\tpath\0`; a rename leaves the path
/// blank and appends `old\0new\0`. Binary files report `-` and count as zero.
fn parse_numstat(raw: &[u8]) -> Vec<(String, u32, u32)> {
    let mut fields = raw
        .split(|byte| *byte == 0)
        .filter(|field| !field.is_empty())
        .map(|field| String::from_utf8_lossy(field).to_string());
    let mut entries = Vec::new();
    while let Some(head) = fields.next() {
        let mut parts = head.splitn(3, '\t');
        let additions = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
        let deletions = parts.next().and_then(|n| n.parse().ok()).unwrap_or(0);
        let path = match parts.next() {
            Some("") | None => {
                // Rename: the path field was empty; old then new follow.
                let _old = fields.next();
                match fields.next() {
                    Some(renamed) => renamed,
                    None => break,
                }
            }
            Some(path) => path.to_string(),
        };
        entries.push((path, additions, deletions));
    }
    entries
}

/// The ceiling lands on the path list *before* anything is opened. Counting
/// lines means reading every file, so a worktree carrying a big untracked
/// tree — a stray `node_modules`, a build output — used to read all of it
/// only to throw the tail away, blocking the command thread for seconds.
/// What survives the cut is read across `map_parallel`, since the cost is
/// almost entirely `stat` and `read` waiting on the disk.
fn untracked_files(worktree: &Path) -> CoreResult<(Vec<ChangedFile>, bool)> {
    let raw = git_bytes(
        worktree,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )?;
    let mut paths: Vec<String> = raw
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| String::from_utf8_lossy(path).to_string())
        .collect();
    let truncated = paths.len() > MAX_FILES;
    paths.truncate(MAX_FILES);

    let counts = crate::parallel::map_parallel(&paths, |path| line_count(&worktree.join(path)));
    let files = paths
        .into_iter()
        .zip(counts)
        .map(|(path, additions)| ChangedFile {
            additions,
            deletions: 0,
            kind: ChangeKind::Added,
            path,
            previous_path: None,
        })
        .collect();
    Ok((files, truncated))
}

fn line_count(path: &Path) -> u32 {
    let small = std::fs::metadata(path)
        .map(|meta| meta.len() <= MAX_COUNTED_BYTES)
        .unwrap_or(false);
    if !small {
        return 0;
    }
    match std::fs::read(path) {
        Ok(bytes) if !bytes.is_empty() => {
            let newlines = bytes.iter().filter(|byte| **byte == b'\n').count() as u32;
            newlines + u32::from(*bytes.last().unwrap_or(&b'\n') != b'\n')
        }
        _ => 0,
    }
}
