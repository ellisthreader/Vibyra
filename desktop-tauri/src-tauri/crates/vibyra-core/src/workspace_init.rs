//! Turning a plain project folder into a Git repository, so that Safe mode has
//! something to branch from.
//!
//! Deliberately the smallest thing that works: `git init` and one commit. No
//! remote is added and nothing is pushed — Safe mode branches locally, and
//! putting a project on GitHub stays the New Project flow's job.

use std::path::{Path, PathBuf};
use std::process::Command;

use crate::workspace_preflight::is_git_work_tree;
use crate::{CoreError, CoreResult};

/// One click must not stage a folder that is really a disk of build output.
const MAX_FILES: usize = 25_000;

fn run(project: &Path, args: &[&str]) -> CoreResult<String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(project)
        .args(args)
        .output()?;
    if output.status.success() {
        return Ok(String::from_utf8_lossy(&output.stdout).trim().to_string());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let detail = stderr
        .lines()
        .find(|line| !line.trim().is_empty())
        .unwrap_or("git failed");
    Err(CoreError::Settings(format!(
        "Could not set up Git here: {}",
        detail.trim()
    )))
}

fn has_commit(project: &Path) -> bool {
    run(project, &["rev-parse", "--verify", "HEAD"]).is_ok()
}

/// Commit as the person, and only fall back to Vibyra's own identity when this
/// machine has none configured — otherwise the first commit fails with "please
/// tell me who you are", which is not what the button promised.
fn identity(project: &Path) -> Vec<&'static str> {
    let configured = run(project, &["config", "--get", "user.email"])
        .map(|email| !email.is_empty())
        .unwrap_or(false);
    if configured {
        Vec::new()
    } else {
        vec![
            "-c",
            "user.name=Vibyra",
            "-c",
            "user.email=desktop@vibyra.local",
        ]
    }
}

/// Files under the folder, counted no further than the cap. Symlinks are never
/// followed, so a link to home cannot turn this into a walk of the disk.
fn count_files(root: &Path) -> usize {
    let mut stack: Vec<PathBuf> = vec![root.to_path_buf()];
    let mut seen = 0;
    while let Some(directory) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(kind) = entry.file_type() else {
                continue;
            };
            if kind.is_symlink() {
                continue;
            }
            if kind.is_dir() {
                if entry.file_name() != ".git" {
                    stack.push(entry.path());
                }
                continue;
            }
            seen += 1;
            if seen > MAX_FILES {
                return seen;
            }
        }
    }
    seen
}

/// Leaves the folder as a repository with at least one commit — everything
/// Safe mode needs. Safe to run twice: an existing repository keeps its
/// history, and only a repository with no commits at all gets one made.
pub fn initialise_repository(project_root: &Path) -> CoreResult<()> {
    let project = project_root.canonicalize()?;
    if !project.is_dir() {
        return Err(CoreError::InvalidPath(
            "Set up Git needs a project folder".to_string(),
        ));
    }
    if !is_git_work_tree(&project) {
        run(&project, &["init"])?;
    }
    if has_commit(&project) {
        return Ok(());
    }
    if count_files(&project) > MAX_FILES {
        return Err(CoreError::Settings(format!(
            "This folder holds more than {MAX_FILES} files. Set up Git in a terminal, where you can choose what to leave out first."
        )));
    }
    run(&project, &["add", "-A"])?;
    let mut args = identity(&project);
    args.extend(["commit", "-m", "Initial commit", "--allow-empty"]);
    run(&project, &args)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace_preflight::safe_workspace_preflight;

    #[test]
    fn leaves_a_folder_a_safe_launch_can_branch_from() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("Notes");
        std::fs::create_dir_all(project.join("src")).unwrap();
        std::fs::write(project.join("src/main.rs"), "fn main() {}").unwrap();

        initialise_repository(&project).unwrap();

        // A repository with a commit and nothing outstanding: Safe mode can
        // branch from it without asking anyone to approve local changes.
        let preflight = safe_workspace_preflight(&project).unwrap();
        assert!(preflight.repository);
        assert_eq!(preflight.changed_files, 0);

        // Running it again keeps the history it already has.
        let head = run(&project, &["rev-parse", "HEAD"]).unwrap();
        initialise_repository(&project).unwrap();
        assert_eq!(run(&project, &["rev-parse", "HEAD"]).unwrap(), head);
    }

    #[test]
    fn an_empty_folder_still_ends_up_with_a_commit() {
        let temp = tempfile::tempdir().unwrap();
        let project = temp.path().join("Empty");
        std::fs::create_dir_all(&project).unwrap();

        initialise_repository(&project).unwrap();

        assert!(has_commit(&project));
    }
}
