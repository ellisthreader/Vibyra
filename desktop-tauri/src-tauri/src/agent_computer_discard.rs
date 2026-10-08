//! Delete the private Agent worktree Vibyra created for one edit grant.
use crate::agent_computer_apply::git_cmd;
use crate::agent_computer_store::Grant;
use serde_json::{json, Value};
use std::path::Path;

/// `storage` is the managed `agent-computer-worktrees` folder. Only the exact
/// `<storage>/<grant id>` worktree registered in the source repository is
/// removed; its branch is deleted unless it has a remote or upstream.
pub(crate) fn discard(grant: &Grant, storage: &Path) -> Result<Value, String> {
    grant.validate_path()?;
    let source = grant
        .source_path
        .as_deref()
        .filter(|source| *source != grant.path)
        .ok_or("This grant has no separate Agent worktree.")?;
    let managed = storage
        .canonicalize()
        .map_err(|_| "Agent worktree storage is unavailable.")?
        .join(&grant.id);
    if !super::looks_uuid(&grant.id) || grant.path != managed {
        return Err("Only a Vibyra Agent worktree can be discarded here.".into());
    }
    let target = grant
        .path
        .to_str()
        .ok_or("The Agent worktree path is unavailable.")?;
    let listed = git_cmd::run(source, &["worktree", "list", "--porcelain", "-z"], None)?;
    if !listed_worktree(&listed, &grant.path) {
        return Err("This folder is not a worktree of the granted project.".into());
    }
    git_cmd::run(source, &["worktree", "remove", "--force", target], None)
        .map_err(|_| "Could not delete the Agent worktree.".to_string())?;
    let branch = format!("vibyra-agent/{}", grant.id);
    let local = format!("refs/heads/{branch}");
    let exists = git_cmd::run(source, &["rev-parse", "--verify", "--quiet", &local], None).is_ok();
    let remote = git_cmd::run(
        source,
        &["for-each-ref", "--format=%(refname)", "refs/remotes"],
        None,
    )
    .map(|refs| {
        String::from_utf8_lossy(&refs)
            .lines()
            .any(|line| line.ends_with(&format!("/{branch}")))
    })
    .unwrap_or(true);
    let upstream = git_cmd::run(
        source,
        &["config", "--get", &format!("branch.{branch}.remote")],
        None,
    )
    .is_ok();
    let deleted = exists
        && !remote
        && !upstream
        && git_cmd::run(source, &["branch", "-D", &branch], None).is_ok();
    Ok(json!({"removed":true,"branchDeleted":deleted,"branchKept":exists && !deleted}))
}

// Git uses slash-separated, non-verbatim Windows paths. Compare directory objects,
// after refusing links; the grant's managed path and identity were checked above.
fn listed_worktree(listed: &[u8], target: &Path) -> bool {
    let Ok(listed) = std::str::from_utf8(listed) else {
        return false;
    };
    listed.split('\0').any(|record| {
        let Some(path) = record.strip_prefix("worktree ").map(Path::new) else {
            return false;
        };
        let Ok(meta) = std::fs::symlink_metadata(path) else {
            return false;
        };
        if !meta.is_dir() || meta.file_type().is_symlink() {
            return false;
        }
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if meta.file_attributes() & 0x400 != 0 {
                return false;
            }
        }
        path.canonicalize().is_ok_and(|listed| listed == target)
    })
}

#[cfg(test)]
#[path = "agent_computer_discard_path_tests.rs"]
mod path_tests;
