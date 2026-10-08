//! The stash list, saving the tracked changes, and popping one back.
use super::{changed_files, unmerged, GitResult};
use crate::fsx::ship::git::{git, text};
use crate::fsx::ship::ShipError;
use serde::Serialize;
use std::path::Path;

const MAX_STASHES: usize = 50;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub time_ms: u64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PopOutcome {
    /// The stash did not apply cleanly: it is kept, and the conflicts are listed in the panel.
    pub conflicts: bool,
}

pub fn stash_list(root: &Path) -> GitResult<Vec<StashEntry>> {
    let out = text(
        root,
        &[
            "stash",
            "list",
            &format!("--max-count={MAX_STASHES}"),
            "--format=%ct%x1f%gs",
        ],
    )?;
    Ok(out
        .lines()
        .enumerate()
        .filter_map(|(index, line)| {
            let (seconds, message) = line.split_once('\u{1f}')?;
            Some(StashEntry {
                index: index as u32,
                message: message
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(160)
                    .collect(),
                time_ms: seconds.parse::<u64>().ok()? * 1000,
            })
        })
        .collect())
}

/// Stashes tracked changes (untracked files stay). Refuses an empty stash.
pub fn stash_save(root: &Path, message: &str) -> GitResult<()> {
    if !unmerged(root)?.is_empty() {
        return Err(ShipError::new(
            "Finish resolving the merge conflicts before stashing.",
        ));
    }
    if changed_files(root)?.is_empty() {
        return Err(ShipError::new("There are no changes to stash."));
    }
    let message: String = message
        .chars()
        .filter(|c| !c.is_control())
        .take(120)
        .collect();
    let message = if message.trim().is_empty() {
        "Stashed from Vibyra".to_string()
    } else {
        message.trim().to_string()
    };
    text(root, &["stash", "push", "-m", &message])?;
    Ok(())
}

pub fn stash_pop(root: &Path, index: u32) -> GitResult<PopOutcome> {
    if index as usize >= MAX_STASHES {
        return Err(ShipError::new("That stash is out of range."));
    }
    if stash_list(root)?.iter().all(|entry| entry.index != index) {
        return Err(ShipError::new("That stash no longer exists."));
    }
    match git(root, &["stash", "pop", &format!("stash@{{{index}}}")]) {
        Ok(_) => Ok(PopOutcome { conflicts: false }),
        Err(error) if !unmerged(root)?.is_empty() => {
            let _ = error;
            Ok(PopOutcome { conflicts: true })
        }
        Err(error) => Err(error),
    }
}
