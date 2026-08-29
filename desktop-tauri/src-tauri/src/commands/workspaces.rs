use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use serde::Serialize;

use super::run_blocking;

// Settings ▸ Safe workspaces reports one number the renderer cannot honestly
// produce for itself: how much disk the safe-mode worktrees are holding. A
// worktree is a whole checkout, so measuring one from the webview would mean
// tens of thousands of IPC round trips — the walk belongs here, off the IPC
// thread through `run_blocking`, and bounded, because a checkout carrying its
// own dependencies is a tree with no natural ceiling.
//
// The ceiling is why `complete` exists. A walk that runs out of budget returns
// the bytes it did reach and says so, and the pane renders "at least" rather
// than a total it made up.

/// Large enough to cover a real checkout including its dependency folders,
/// small enough that the worst case is a walk of well under a second.
const MAX_ENTRIES: usize = 300_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskUsage {
    pub bytes: u64,
    /// False when the walk hit `MAX_ENTRIES` and stopped early, which makes
    /// `bytes` a floor rather than a total.
    pub complete: bool,
}

/// The size of the directories the given worktrees live in.
///
/// Worktrees are measured through their parent rather than one by one, so the
/// figure covers the whole safe-workspace root — including the stray patches
/// and snapshot indexes a dying launch strands beside them, which are part of
/// the very leak this pane exists to report.
#[tauri::command]
pub async fn workspaces_disk_usage(worktrees: Vec<String>) -> Result<DiskUsage, String> {
    run_blocking(move || Ok(measure(&roots(&worktrees)))).await
}

/// The deduplicated parents, with any root that sits inside another dropped —
/// counting a folder twice would inflate the total the user is shown.
fn roots(worktrees: &[String]) -> Vec<PathBuf> {
    let mut parents = BTreeSet::new();
    for worktree in worktrees {
        if let Some(parent) = Path::new(worktree).parent() {
            parents.insert(parent.to_path_buf());
        }
    }
    parents
        .iter()
        .filter(|root| {
            !parents
                .iter()
                .any(|other| other != *root && root.starts_with(other))
        })
        .cloned()
        .collect()
}

fn measure(roots: &[PathBuf]) -> DiskUsage {
    let mut budget = MAX_ENTRIES;
    let mut bytes = 0;
    for root in roots {
        bytes += walk(root, &mut budget);
    }
    // Exhausting the budget on the very last entry reads as incomplete. That
    // errs towards under-claiming, which is the only safe direction here.
    DiskUsage {
        bytes,
        complete: budget > 0,
    }
}

/// Iterative rather than recursive: directory depth is the user's to choose,
/// and it has no business landing on this thread's stack. Symlinks are counted
/// as their own entry and never followed, so a link loop cannot spin here.
fn walk(root: &Path, budget: &mut usize) -> u64 {
    let mut bytes = 0;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(listing) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in listing.flatten() {
            if *budget == 0 {
                return bytes;
            }
            *budget -= 1;
            let Ok(meta) = entry.metadata() else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                bytes += meta.len();
            }
        }
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The app crate's house pattern for a scratch tree: process-scoped, and
    /// cleared on entry so a killed run cannot poison the next one.
    fn scratch(name: &str) -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "vibyra-worktree-size-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&root);
        root
    }

    fn write(path: &Path, bytes: usize) {
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, vec![b'x'; bytes]).unwrap();
    }

    #[test]
    fn a_worktree_is_measured_through_its_parent_root() {
        let root = scratch("parent");
        write(&root.join("vibyra-1/a.txt"), 1000);
        write(&root.join("vibyra-2/deep/b.txt"), 2000);
        // A stray patch beside the worktrees counts too: it is part of the leak.
        write(&root.join("x.vibyra-merge.patch"), 500);

        let usage = measure(&roots(&[root
            .join("vibyra-1")
            .to_string_lossy()
            .into_owned()]));
        assert_eq!(usage.bytes, 3500);
        assert!(usage.complete);
    }

    #[test]
    fn two_worktrees_under_one_root_are_not_counted_twice() {
        let root = scratch("dedupe");
        write(&root.join("vibyra-1/a.txt"), 1000);
        write(&root.join("vibyra-2/b.txt"), 1000);

        let usage = measure(&roots(&[
            root.join("vibyra-1").to_string_lossy().into_owned(),
            root.join("vibyra-2").to_string_lossy().into_owned(),
        ]));
        assert_eq!(usage.bytes, 2000);
    }

    #[test]
    fn a_walk_that_runs_out_of_budget_says_so_instead_of_guessing() {
        let root = scratch("budget");
        for index in 0..20 {
            write(&root.join(format!("vibyra-1/f{index}.txt")), 100);
        }

        let mut budget = 5;
        let bytes = walk(&root, &mut budget);
        assert_eq!(budget, 0);
        assert!(bytes < 2000, "a bounded walk must not reach every file");
    }
}
