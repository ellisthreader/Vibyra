use std::path::Path;

use crate::CoreResult;

use super::{git_bytes, ChangeKind, ChangedFile, WorktreeStatus};

/// The list stays scannable and the IPC payload bounded; a worktree with more
/// changed files than this is reported as truncated, never trimmed silently.
const MAX_FILES: usize = 2_000;

/// Untracked files are counted by reading them; past this size the count is
/// skipped rather than paid for.
const MAX_COUNTED_BYTES: u64 = 1024 * 1024;

/// Everything the agent changed in `worktree` since `base` — tracked changes
/// from `git diff`, plus files it created that were never added.
pub fn worktree_status(worktree: &Path, base: &str) -> CoreResult<WorktreeStatus> {
    let mut changed = tracked_changes(worktree, base)?;
    changed.extend(untracked_files(worktree)?);
    changed.sort_by(|a, b| a.path.cmp(&b.path));
    let truncated = changed.len() > MAX_FILES;
    changed.truncate(MAX_FILES);
    Ok(WorktreeStatus { changed, truncated })
}

fn tracked_changes(worktree: &Path, base: &str) -> CoreResult<Vec<ChangedFile>> {
    let names = git_bytes(worktree, &["diff", "--name-status", "-z", base, "--", "."])?;
    let stats = git_bytes(worktree, &["diff", "--numstat", "-z", base, "--", "."])?;
    let counts = parse_numstat(&stats);
    Ok(parse_name_status(&names)
        .into_iter()
        .map(|(path, kind)| {
            let (additions, deletions) = counts
                .iter()
                .find(|(counted, _, _)| *counted == path)
                .map(|(_, additions, deletions)| (*additions, *deletions))
                .unwrap_or((0, 0));
            ChangedFile {
                path,
                kind,
                additions,
                deletions,
            }
        })
        .collect())
}

/// `--name-status -z` emits `STATUS\0path\0`, and for renames
/// `R<score>\0old\0new\0`. The new path is the one worth showing.
fn parse_name_status(raw: &[u8]) -> Vec<(String, ChangeKind)> {
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
                entries.push((renamed, ChangeKind::Renamed));
                continue;
            }
            _ => ChangeKind::Modified,
        };
        entries.push((path, kind));
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

fn untracked_files(worktree: &Path) -> CoreResult<Vec<ChangedFile>> {
    let raw = git_bytes(
        worktree,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )?;
    Ok(raw
        .split(|byte| *byte == 0)
        .filter(|path| !path.is_empty())
        .map(|path| {
            let path = String::from_utf8_lossy(path).to_string();
            ChangedFile {
                additions: line_count(&worktree.join(&path)),
                deletions: 0,
                kind: ChangeKind::Added,
                path,
            }
        })
        .collect())
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
