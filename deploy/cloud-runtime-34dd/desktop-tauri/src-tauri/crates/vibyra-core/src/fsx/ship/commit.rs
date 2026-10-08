//! Commit what the person chose, in a worktree Vibyra created.
use super::git::text;
use super::guard::resolve;
use super::step::run;
use super::ShipError;
use crate::fsx::git_changes::{changes, ChangedFile};
use serde::Serialize;
use std::sync::atomic::AtomicBool;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitOutcome {
    pub sha: String,
    pub subject: String,
    pub files: usize,
}

const MAX_MESSAGE: usize = 4_000;
const MAX_PATHS: usize = 500;

fn clean_message(message: &str) -> Result<String, ShipError> {
    let message = message.trim();
    if message.is_empty() {
        return Err(ShipError::new("Write a commit message first."));
    }
    if message.len() > MAX_MESSAGE || message.contains('\0') {
        return Err(ShipError::new("That commit message is too long."));
    }
    Ok(message.to_owned())
}

/// The exact paths to add for a chosen subset: each must be in the change
/// list (a rename brings its source), and nothing else may already be staged.
fn chosen_paths(listed: &[ChangedFile], chosen: &[String]) -> Result<Vec<String>, ShipError> {
    if chosen.is_empty() || chosen.len() > MAX_PATHS {
        return Err(ShipError::new("Choose at least one file to commit."));
    }
    let mut add: Vec<String> = Vec::new();
    for path in chosen {
        let file = listed
            .iter()
            .find(|f| &f.path == path)
            .ok_or_else(|| ShipError::new(format!("{path} has no changes to commit.")))?;
        add.push(file.path.clone());
        add.extend(file.previous_path.clone());
    }
    let staged_elsewhere = listed.iter().any(|f| {
        let x = f.status.as_bytes()[0];
        x != b' ' && x != b'?' && !add.contains(&f.path)
    });
    if staged_elsewhere {
        return Err(ShipError::new(
            "Other files are already staged. Commit everything, or unstage them in a terminal.",
        ));
    }
    add.sort();
    add.dedup();
    Ok(add)
}

/// `paths` is `None` for everything, otherwise exact entries from the change
/// list. Files already staged outside that choice stop the commit rather than
/// being swept in or silently unstaged. Hooks never run (no terminal to answer
/// them); the person's signing and identity settings do.
pub fn commit(
    project_root: &str,
    worktree_root: &str,
    message: &str,
    paths: Option<&[String]>,
    cancel: &AtomicBool,
) -> Result<CommitOutcome, ShipError> {
    let message = clean_message(message)?;
    let target = resolve(project_root, worktree_root)?;
    let root = target.root.to_string_lossy().into_owned();
    let listed = changes(&root)
        .map_err(|_| ShipError::new("The changes could not be read."))?
        .files;
    if listed
        .iter()
        .any(|f| f.status.contains('U') || ["AA", "DD"].contains(&f.status.as_str()))
    {
        return Err(ShipError::new(
            "Resolve the merge conflicts before committing.",
        ));
    }
    if listed.is_empty() {
        return Err(ShipError::new("There is nothing to commit."));
    }
    let files = match paths {
        None => {
            run(&target.root, "Staging the changes", &["add", "-A"], cancel)?;
            listed.len()
        }
        Some(chosen) => {
            let add = chosen_paths(&listed, chosen)?;
            let mut args = vec!["add", "-A", "--"];
            args.extend(add.iter().map(String::as_str));
            run(&target.root, "Staging the changes", &args, cancel)?;
            chosen.len()
        }
    };
    run(
        &target.root,
        "Making the commit",
        &["commit", "--no-verify", "-m", &message],
        cancel,
    )?;
    let sha = text(&target.root, &["rev-parse", "HEAD"])?;
    let subject = message.lines().next().unwrap_or("").to_owned();
    Ok(CommitOutcome {
        sha,
        subject,
        files,
    })
}
