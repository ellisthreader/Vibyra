//! Reviewing and applying what the cloud computer changed in a synced project.
//!
//! The cloud's snapshot sits in the project's shadow repo (`vibyra-sync`). This turns
//! the files it touched into the same `CloudFile` lists the checkpoint review uses, so
//! the existing three-way merge (`cloud_merge`) decides what is safe: base = the last
//! snapshot both sides share, ours = the file on disk, theirs = the cloud's version.
//! Applying keeps that flow's safety: a backup of every original file and a copy of
//! the cloud's files first, conflicts keep the Mac version, nothing is written if a
//! file changed after the review.

use super::cloud_files;
use super::cloud_merge;
pub use super::cloud_sync_collect::{collect, Unapplied};
use serde::Serialize;
use serde_json::{json, Value};
use std::path::Path;
use vibyra_sync::{Engine, ProjectRef};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChangeReview {
    pub seq: u64,
    #[serde(flatten)]
    pub review: cloud_merge::Review,
    pub unapplied: Vec<Unapplied>,
}

pub fn review(engine: &Engine, project: &ProjectRef) -> Result<Option<ChangeReview>, String> {
    let Some(c) = collect(engine, project)? else {
        return Ok(None);
    };
    let review = cloud_merge::review(&project.root, &c.base, &c.theirs)?;
    Ok(Some(ChangeReview {
        seq: c.change.seq,
        review,
        unapplied: c.unapplied,
    }))
}

/// One file's three versions in the shape `CloudFileReview` draws.
pub fn file_review(engine: &Engine, project: &ProjectRef, path: &str) -> Result<Value, String> {
    let c =
        collect(engine, project)?.ok_or("The cloud has no pending changes for this project.")?;
    let review = cloud_merge::review(&project.root, &c.base, &c.theirs)?;
    if !review
        .changes
        .iter()
        .chain(&review.conflicts)
        .any(|p| p == path)
    {
        return Err("Choose a file in the reviewed change list.".into());
    }
    let local = cloud_files::read(&project.root, path)?;
    Ok(json!({
        "path": path,
        "base": super::cloud_sync_file_version::version(c.base.iter().find(|f| f.path == path)),
        "local": super::cloud_sync_file_version::version(local.as_ref()),
        "cloud": super::cloud_sync_file_version::version(c.theirs.iter().find(|f| f.path == path)),
    }))
}

/// Applies the reviewed change (backup first, conflicts keep the Mac file) and then dismisses it.
pub fn apply(
    engine: &Engine,
    project: &ProjectRef,
    seq: u64,
    digest: &str,
    backup: &Path,
) -> Result<Value, String> {
    let c =
        collect(engine, project)?.ok_or("The cloud has no pending changes for this project.")?;
    if c.change.seq != seq {
        return Err("The cloud changed again. Review again.".into());
    }
    let mut result = cloud_merge::apply(&project.root, &c.base, &c.theirs, digest, backup)?;
    engine
        .dismiss_cloud_changes(project, seq)
        .map_err(|e| e.to_string())?;
    result["unapplied"] = json!(c.unapplied);
    Ok(result)
}

/// Quietly applies a change only when nothing it touches changed on this Mac since the last upload and
/// every file could be handled; returns the number of files written, or `None` when a review is needed.
pub fn auto_apply(
    engine: &Engine,
    project: &ProjectRef,
    backup: &Path,
) -> Result<Option<usize>, String> {
    let Some(c) = collect(engine, project)? else {
        return Ok(Some(0));
    };
    let review = cloud_merge::review(&project.root, &c.base, &c.theirs)?;
    if !review.conflicts.is_empty() || !c.unapplied.is_empty() {
        return Ok(None);
    }
    let written = review.changes.len();
    if written > 0 {
        cloud_merge::apply(&project.root, &c.base, &c.theirs, &review.digest, backup)?;
    }
    engine
        .dismiss_cloud_changes(project, c.change.seq)
        .map_err(|e| e.to_string())?;
    Ok(Some(written))
}
