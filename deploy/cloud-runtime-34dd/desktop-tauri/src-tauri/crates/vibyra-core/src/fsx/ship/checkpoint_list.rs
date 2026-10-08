//! The private refs `refs/vibyra/checkpoints/<session>/<n>`.
use super::git::{git, text};
use super::ShipError;
use serde::Serialize;
use std::path::Path;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub n: u32,
    pub session: String,
    pub reference: String,
    pub commit: String,
    pub tree: String,
    pub label: String,
    pub time: i64,
}

/// One path component of a ref: no separators, no dots at the start.
pub(super) fn session_ok(session: &str) -> bool {
    (1..=64).contains(&session.len())
        && session
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// The session key a worktree's checkpoints live under: its branch, flattened.
pub(super) fn key_for_branch(branch: &str) -> String {
    branch
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '_' {
                c
            } else {
                '-'
            }
        })
        .take(64)
        .collect()
}

pub(super) fn read(root: &Path, session: &str) -> Result<Vec<Checkpoint>, ShipError> {
    if !session_ok(session) {
        return Err(ShipError::new("That checkpoint session name is not valid."));
    }
    let prefix = format!("refs/vibyra/checkpoints/{session}/");
    let raw = text(
        root,
        &[
            "for-each-ref",
            "--format=%(refname)%1f%(objectname)%1f%(tree)%1f%(committerdate:unix)%1f%(subject)",
            &prefix,
        ],
    )?;
    let mut found: Vec<Checkpoint> = raw
        .lines()
        .filter_map(|line| {
            let mut p = line.split('\u{1f}');
            let reference = p.next()?.to_owned();
            let n = reference.strip_prefix(&prefix)?.parse().ok()?;
            Some(Checkpoint {
                n,
                session: session.to_owned(),
                commit: p.next()?.into(),
                tree: p.next()?.into(),
                time: p.next()?.parse().ok()?,
                label: p.next()?.trim_start_matches("Vibyra checkpoint: ").into(),
                reference,
            })
        })
        .collect();
    found.sort_by_key(|c| c.n);
    Ok(found)
}

pub fn list_checkpoints(
    project_root: &str,
    worktree_root: &str,
    session: Option<&str>,
) -> Result<Vec<Checkpoint>, ShipError> {
    let target = super::guard::resolve_linked(project_root, worktree_root)?;
    let key = session.map_or_else(|| key_for_branch(&target.branch), str::to_owned);
    read(&target.root, &key)
}

pub(super) fn delete(root: &Path, reference: &str) {
    let _ = git(root, &["update-ref", "-d", reference]);
}
