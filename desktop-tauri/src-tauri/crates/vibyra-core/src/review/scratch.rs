use std::path::{Path, PathBuf};

use crate::{CoreError, CoreResult};

use super::git;

// The merge's on-disk companions — the patch and the throwaway index — and
// the repository-identity check that has to pass before either is worth
// creating. Split from merge.rs along the state/rules seam: merge.rs decides
// what happens, this file owns where the scratch material lives.

/// A `vibyra/*` branch name proves the worktree is ours; it does not prove it
/// belongs to *this* repository. Applying one repo's patch inside another —
/// or removing a worktree registered elsewhere — must refuse before anything
/// is touched, since both paths arrive from the renderer.
pub(super) fn same_repository(repo: &Path, source: &Path) -> CoreResult<()> {
    let common = |root: &Path| -> CoreResult<PathBuf> {
        let dir = git(root, &["rev-parse", "--git-common-dir"])?;
        let dir = PathBuf::from(dir.trim());
        let dir = if dir.is_absolute() {
            dir
        } else {
            root.join(dir)
        };
        Ok(dir.canonicalize()?)
    };
    if common(repo)? != common(source)? {
        return Err(CoreError::Settings(
            "That workspace belongs to a different repository.".to_string(),
        ));
    }
    Ok(())
}

/// The patch sits beside the worktree, not in a shared temp dir: cleaned with
/// it, and never racing another merge. The pid+counter suffix keeps the name
/// unique so an existing sibling file can never be overwritten and deleted;
/// the `.vibyra-merge.patch` tail is what the housekeeping sweep reaps.
pub(super) fn patch_path(worktree: &Path) -> PathBuf {
    let name = scratch_name(worktree);
    worktree.with_file_name(format!("{name}.vibyra-merge.patch"))
}

/// The scratch index keeps the same company, and wears the `snapshot-*.index`
/// name the housekeeping sweep already knows to reap if a merge dies.
pub(super) fn scratch_index(worktree: &Path) -> PathBuf {
    let name = scratch_name(worktree);
    worktree.with_file_name(format!("snapshot-merge-{name}.index"))
}

fn scratch_name(worktree: &Path) -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let name = worktree
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("merge");
    let tick = COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{name}-{}-{tick}", std::process::id())
}

/// `create_new` so a name that somehow already exists is an error, never a
/// silent overwrite of somebody else's file.
pub(super) fn scratch_write(path: &Path, bytes: &[u8]) -> CoreResult<()> {
    use std::io::Write;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(path)?;
    file.write_all(bytes)?;
    Ok(())
}
