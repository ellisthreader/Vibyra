//! Separate, clean worktree for an Agent Computer edit grant.
use crate::{fsx, CoreError, CoreResult};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

fn git(root: &Path, args: &[&str]) -> CoreResult<Output> {
    let filters = fsx::git_command_policy::filter_overrides(root)?;
    let mut command = Command::new("git");
    command.args([
        "--no-pager",
        "-c",
        "core.hooksPath=/dev/null",
        "-c",
        "core.fsmonitor=false",
    ]);
    for filter in filters {
        command.arg("-c").arg(filter);
    }
    let output = command
        .arg("-C")
        .arg(root)
        .args(args)
        .env_remove("GIT_CONFIG_COUNT")
        .env_remove("GIT_CONFIG_PARAMETERS")
        .env_remove("GIT_DIR")
        .env_remove("GIT_WORK_TREE")
        .env_remove("GIT_INDEX_FILE")
        .env_remove("GIT_COMMON_DIR")
        .output()?;
    if !output.status.success() || output.stdout.len() > 1024 * 1024 {
        return Err(CoreError::Task(
            "Could not prepare a private Git worktree".into(),
        ));
    }
    Ok(output)
}

fn text(root: &Path, args: &[&str]) -> CoreResult<String> {
    String::from_utf8(git(root, args)?.stdout)
        .map(|value| value.trim().to_owned())
        .map_err(|_| CoreError::Task("Git returned an invalid path".into()))
}

fn private_root(root: &Path) -> CoreResult<()> {
    match std::fs::symlink_metadata(root) {
        Ok(metadata) if !metadata.is_dir() || metadata.file_type().is_symlink() => {
            return Err(CoreError::InvalidPath(
                "Agent worktree storage changed".into(),
            ));
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir(root)?;
        }
        Err(error) => return Err(error.into()),
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(root, std::fs::Permissions::from_mode(0o700))?;
    }
    Ok(())
}

fn discard(source: &Path, target: &str, branch: &str) {
    let _ = git(source, &["worktree", "remove", "--force", target]);
    let _ = git(source, &["branch", "-D", branch]);
}

pub fn classify_edit_source(source: &Path) -> CoreResult<bool> {
    if crate::workspace_preflight::is_git_work_tree(source) {
        preflight(source)?;
        return Ok(true);
    }
    if source
        .ancestors()
        .any(|ancestor| ancestor.join(".git").exists())
    {
        return Err(CoreError::Task(
            "This Git folder is unavailable; choose a healthy repository root".into(),
        ));
    }
    Ok(false)
}

/// Check before replacing an existing cloud grant, then repeat immediately
/// before worktree creation in case the repository changed in between.
pub fn preflight(source: &Path) -> CoreResult<PathBuf> {
    let source = source.canonicalize()?;
    let root = text(&source, &["rev-parse", "--show-toplevel"])?;
    if source != Path::new(&root).canonicalize()? {
        return Err(CoreError::InvalidPath(
            "Choose the Git repository root for edits".into(),
        ));
    }
    git(&source, &["rev-parse", "--verify", "HEAD"])?;
    if !fsx::git_changes::safe_changes(
        source
            .to_str()
            .ok_or_else(|| CoreError::InvalidPath("Git path is not valid UTF-8".into()))?,
    )?
    .files
    .is_empty()
    {
        return Err(CoreError::Task(
            "Commit or stash local changes before granting Agent edits".into(),
        ));
    }
    let tracked = git(&source, &["ls-files", "--stage", "-z"])?.stdout;
    if tracked
        .split(|byte| *byte == 0)
        .any(|entry| entry.starts_with(b"160000 "))
    {
        return Err(CoreError::Task(
            "Agent edits do not yet support Git submodules".into(),
        ));
    }
    Ok(source)
}

/// Only committed files enter the worktree. Local changes and ignored files
/// remain in the user's checkout.
pub fn prepare(source: &Path, storage: &Path, id: &str) -> CoreResult<PathBuf> {
    if !id
        .bytes()
        .all(|byte| byte.is_ascii_hexdigit() || byte == b'-')
        || id.len() != 36
    {
        return Err(CoreError::InvalidPath(
            "Invalid Agent workspace identity".into(),
        ));
    }
    let source = preflight(source)?;
    let parent = storage
        .parent()
        .ok_or_else(|| CoreError::InvalidPath("Invalid Agent worktree storage".into()))?
        .canonicalize()?;
    if parent.starts_with(&source) {
        return Err(CoreError::InvalidPath(
            "Agent worktree storage is inside the granted repository".into(),
        ));
    }
    private_root(storage)?;
    let canonical_storage = storage.canonicalize()?;
    if source.starts_with(&canonical_storage) {
        return Err(CoreError::InvalidPath(
            "The granted repository is inside Agent worktree storage".into(),
        ));
    }
    let target = storage.join(id);
    if target.exists() || std::fs::symlink_metadata(&target).is_ok() {
        return Err(CoreError::InvalidPath(
            "Agent worktree already exists".into(),
        ));
    }
    let branch = format!("vibyra-agent/{id}");
    let target_str = target
        .to_str()
        .ok_or_else(|| CoreError::InvalidPath("Worktree path is not valid UTF-8".into()))?;
    if let Err(error) = git(
        &source,
        &[
            "worktree",
            "add",
            "--no-checkout",
            "-b",
            &branch,
            target_str,
            "HEAD",
        ],
    ) {
        discard(&source, target_str, &branch);
        return Err(error);
    }
    let result = (|| {
        git(&target, &["read-tree", "HEAD"])?;
        git(&target, &["checkout-index", "-a"])?;
        if !fsx::git_changes::safe_changes(target_str)?.files.is_empty() {
            return Err(CoreError::Task(
                "Agent worktree checkout is incomplete".into(),
            ));
        }
        Ok(target.canonicalize()?)
    })();
    if result.is_err() {
        discard(&source, target_str, &branch);
    }
    result
}

#[cfg(test)]
#[path = "workspace_agent_tests.rs"]
mod tests;
