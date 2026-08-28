use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::path::Path;

use crate::{CoreError, CoreResult};

#[path = "project_activity_git.rs"]
mod git;
#[path = "project_activity_untracked.rs"]
mod untracked;

use git::{git_output, required_git, GitOutput};
use untracked::count_untracked;

const DATE_MARKER: &str = "@@VIBYRA_DATE@@";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityCounts {
    pub additions: u64,
    pub deletions: u64,
    pub changed_files: u32,
    pub commits: u32,
    pub binary_files: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDay {
    pub date: String,
    #[serde(flatten)]
    pub counts: ActivityCounts,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectActivity {
    pub is_git: bool,
    pub days: Vec<ActivityDay>,
    pub working_tree: ActivityCounts,
    pub truncated: bool,
}

#[derive(Default)]
struct DayBucket {
    counts: ActivityCounts,
    paths: HashSet<String>,
}

pub fn project_activity(root: &Path) -> CoreResult<ProjectActivity> {
    let root = root
        .canonicalize()
        .map_err(|_| CoreError::InvalidPath(root.display().to_string()))?;
    if !root.is_dir() {
        return Err(CoreError::InvalidPath(root.display().to_string()));
    }
    let Some(probe) = git_output(&root, &["rev-parse", "--is-inside-work-tree"])? else {
        return Ok(empty_activity());
    };
    if String::from_utf8_lossy(&probe.bytes).trim() != "true" {
        return Ok(empty_activity());
    }

    let history = required_git(
        &root,
        &[
            "log",
            "--no-merges",
            "--since=8 days ago",
            "--date=format-local:%Y-%m-%d",
            "--format=@@VIBYRA_DATE@@%ad",
            "--numstat",
            "--",
            ".",
        ],
    )?;
    let (days, history_cut) = parse_history(&history.bytes);
    let has_head = git_output(&root, &["rev-parse", "--verify", "HEAD"])?.is_some();
    let tracked = if has_head {
        required_git(&root, &["diff", "--numstat", "HEAD", "--", "."])?
    } else {
        GitOutput {
            bytes: Vec::new(),
            truncated: false,
        }
    };
    let (mut working_tree, mut paths) = parse_counts(&tracked.bytes);
    let untracked = required_git(&root, &["ls-files", "--others", "--exclude-standard", "-z"])?;
    let untracked_cut = count_untracked(&root, &untracked.bytes, &mut working_tree, &mut paths);
    working_tree.changed_files = paths.len().min(u32::MAX as usize) as u32;

    Ok(ProjectActivity {
        is_git: true,
        days,
        working_tree,
        truncated: probe.truncated
            || history.truncated
            || history_cut
            || tracked.truncated
            || untracked.truncated
            || untracked_cut,
    })
}

fn empty_activity() -> ProjectActivity {
    ProjectActivity {
        is_git: false,
        days: Vec::new(),
        working_tree: ActivityCounts::default(),
        truncated: false,
    }
}

fn parse_history(raw: &[u8]) -> (Vec<ActivityDay>, bool) {
    let mut buckets = BTreeMap::<String, DayBucket>::new();
    let mut current = None::<String>;
    for line in String::from_utf8_lossy(raw).lines() {
        if let Some(date) = line.strip_prefix(DATE_MARKER) {
            current = Some(date.trim().to_string());
            buckets
                .entry(date.trim().to_string())
                .or_default()
                .counts
                .commits += 1;
        } else if let Some(date) = current.as_ref() {
            if let Some((additions, deletions, path, binary)) = numstat(line) {
                let bucket = buckets.entry(date.clone()).or_default();
                bucket.counts.additions = bucket.counts.additions.saturating_add(additions);
                bucket.counts.deletions = bucket.counts.deletions.saturating_add(deletions);
                bucket.counts.binary_files += u32::from(binary);
                bucket.paths.insert(path);
            }
        }
    }
    let days = buckets
        .into_iter()
        .map(|(date, mut bucket)| {
            bucket.counts.changed_files = bucket.paths.len().min(u32::MAX as usize) as u32;
            ActivityDay {
                date,
                counts: bucket.counts,
            }
        })
        .collect();
    (days, false)
}

fn parse_counts(raw: &[u8]) -> (ActivityCounts, HashSet<String>) {
    let mut counts = ActivityCounts::default();
    let mut paths = HashSet::new();
    for line in String::from_utf8_lossy(raw).lines() {
        if let Some((additions, deletions, path, binary)) = numstat(line) {
            counts.additions = counts.additions.saturating_add(additions);
            counts.deletions = counts.deletions.saturating_add(deletions);
            counts.binary_files += u32::from(binary);
            paths.insert(path);
        }
    }
    (counts, paths)
}

fn numstat(line: &str) -> Option<(u64, u64, String, bool)> {
    let mut fields = line.splitn(3, '\t');
    let added = fields.next()?;
    let deleted = fields.next()?;
    let path = fields.next()?.to_string();
    let binary = added == "-" || deleted == "-";
    Some((
        added.parse().unwrap_or(0),
        deleted.parse().unwrap_or(0),
        path,
        binary,
    ))
}

#[cfg(test)]
#[path = "project_activity_tests.rs"]
mod tests;
