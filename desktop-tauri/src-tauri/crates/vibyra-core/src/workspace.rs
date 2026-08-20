use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::workspace_preflight::{git, git_result, safe_workspace_state};
use crate::{CoreError, CoreResult};

static NEXT_WORKTREE: AtomicU64 = AtomicU64::new(0);

fn unique_suffix() -> String {
    let millis = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = NEXT_WORKTREE.fetch_add(1, Ordering::Relaxed);
    format!("{millis:x}-{sequence:x}")
}

fn slug(path: &Path) -> String {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("project");
    let cleaned: String = name
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() {
                character.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect();
    cleaned
        .trim_matches('-')
        .to_string()
        .chars()
        .take(32)
        .collect::<String>()
}

fn snapshot(repo: &Path, worktrees_root: &Path, suffix: &str) -> CoreResult<String> {
    let head = git(repo, &["rev-parse", "HEAD"])?;
    let index = worktrees_root.join(format!("snapshot-{suffix}.index"));
    let run = |args: &[&str]| -> CoreResult<String> {
        let output = Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .env("GIT_INDEX_FILE", &index)
            .env("GIT_AUTHOR_NAME", "Vibyra")
            .env("GIT_AUTHOR_EMAIL", "desktop@vibyra.local")
            .env("GIT_COMMITTER_NAME", "Vibyra")
            .env("GIT_COMMITTER_EMAIL", "desktop@vibyra.local")
            .output()?;
        git_result(output, args.join(" "))
    };

    let result = (|| {
        run(&["read-tree", &head])?;
        run(&["add", "-A", "--", "."])?;
        let tree = run(&["write-tree"])?;
        run(&[
            "commit-tree",
            &tree,
            "-p",
            &head,
            "-m",
            "Vibyra safe-mode snapshot",
        ])
    })();
    let _ = std::fs::remove_file(index);
    result
}

/// Creates an isolated branch containing the current working tree without
/// touching the user's branch, index, staged files, or working directory.
pub fn prepare_safe_workspace(
    project_root: &Path,
    worktrees_root: &Path,
    approved_fingerprint: Option<&str>,
) -> CoreResult<PathBuf> {
    let state = safe_workspace_state(project_root)?;
    if state.preflight.changed_files > 0
        && approved_fingerprint != Some(state.preflight.fingerprint.as_str())
    {
        return Err(CoreError::Settings(
            "Safe mode needs approval for the current local changes".to_string(),
        ));
    }
    std::fs::create_dir_all(worktrees_root)?;
    let suffix = unique_suffix();
    let commit = if state.preflight.changed_files == 0 {
        git(&state.repo, &["rev-parse", "HEAD"])?
    } else {
        snapshot(&state.repo, worktrees_root, &suffix)?
    };
    let project_slug = slug(&state.project);
    let branch = format!("vibyra/{project_slug}-{suffix}");
    let target = worktrees_root.join(format!("{project_slug}-{suffix}"));
    let output = Command::new("git")
        .arg("-C")
        .arg(&state.repo)
        .args(["worktree", "add", "-b", &branch])
        .arg(&target)
        .arg(&commit)
        .output()?;
    git_result(output, format!("create branch {branch}"))?;

    let cwd = target.join(state.relative);
    if !cwd.is_dir() {
        return Err(CoreError::InvalidPath(
            "Safe-mode project folder was not created".to_string(),
        ));
    }
    Ok(cwd)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_dirty_files_without_touching_head_or_index() {
        let temp = tempfile::tempdir().unwrap();
        let repo = temp.path().join("repo");
        std::fs::create_dir_all(&repo).unwrap();
        Command::new("git").arg("init").arg(&repo).output().unwrap();
        std::fs::write(repo.join("tracked.txt"), "before").unwrap();
        git(&repo, &["add", "."]).unwrap();
        let output = Command::new("git")
            .arg("-C")
            .arg(&repo)
            .args(["-c", "user.name=Test", "-c", "user.email=test@example.com"])
            .args(["commit", "-m", "initial"])
            .output()
            .unwrap();
        assert!(output.status.success());
        let head = git(&repo, &["rev-parse", "HEAD"]).unwrap();
        std::fs::write(repo.join("tracked.txt"), "after").unwrap();
        std::fs::write(repo.join("new.txt"), "new").unwrap();

        let worktrees = temp.path().join("worktrees");
        let preflight = crate::workspace_preflight::safe_workspace_preflight(&repo).unwrap();
        assert_eq!(preflight.changed_files, 2);
        assert!(prepare_safe_workspace(&repo, &worktrees, None).is_err());
        assert!(git(&repo, &["branch", "--list", "vibyra/*"])
            .unwrap()
            .is_empty());

        std::fs::write(repo.join("tracked.txt"), "changed again").unwrap();
        assert!(prepare_safe_workspace(&repo, &worktrees, Some(&preflight.fingerprint)).is_err());
        let approved = crate::workspace_preflight::safe_workspace_preflight(&repo).unwrap();
        let safe = prepare_safe_workspace(&repo, &worktrees, Some(&approved.fingerprint)).unwrap();
        assert_eq!(
            std::fs::read_to_string(safe.join("tracked.txt")).unwrap(),
            "changed again"
        );
        assert_eq!(
            std::fs::read_to_string(safe.join("new.txt")).unwrap(),
            "new"
        );
        assert_eq!(git(&repo, &["rev-parse", "HEAD"]).unwrap(), head);
        assert!(git(&repo, &["status", "--porcelain"])
            .unwrap()
            .contains("tracked.txt"));
    }
}
