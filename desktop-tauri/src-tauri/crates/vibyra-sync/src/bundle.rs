//! `git bundle` artifacts (`kind=code`): exactly one ref, full or incremental against a previous head.
use crate::error::{Result, SyncError};
use crate::git::Git;
use std::path::Path;

pub const CLOUD_REF: &str = "refs/vibyra/cloud";

/// Writes a bundle holding only `refname`. With `exclude_head` the bundle is incremental: commits reachable
/// from that head are left out and it becomes a prerequisite the receiver must already have.
pub fn create_bundle(
    shadow: &Path,
    refname: &str,
    exclude_head: Option<&str>,
    out: &Path,
) -> Result<()> {
    let git = Git::shadow(shadow);
    let _ = std::fs::remove_file(out);
    let out_str = out.to_string_lossy().into_owned();
    let exclude = exclude_head.map(|h| format!("^{h}"));
    let mut args = vec!["bundle", "create", "-q", &out_str, refname];
    if let Some(e) = &exclude {
        args.push(e);
    }
    git.out(&args)?;
    Ok(())
}

/// `git bundle verify` against `repo` (checks prerequisites are present) and that exactly one ref is inside.
/// Returns `(ref name, commit sha)`.
pub fn verify_bundle(repo: &Path, bundle: &Path) -> Result<(String, String)> {
    let git = Git::shadow(repo);
    let file = bundle.to_string_lossy().into_owned();
    git.out(&["bundle", "verify", &file])?;
    let heads = git.text(&["bundle", "list-heads", &file])?;
    let mut lines = heads.lines().filter(|l| !l.trim().is_empty());
    match (lines.next(), lines.next()) {
        (Some(line), None) => {
            let (sha, name) = line
                .split_once(' ')
                .ok_or_else(|| SyncError::Git("odd bundle head".into()))?;
            Ok((name.trim().to_string(), sha.trim().to_string()))
        }
        _ => Err(SyncError::Invalid(
            "a sync bundle must hold exactly one ref".into(),
        )),
    }
}

/// Fetches `src_ref` from the bundle into `dst_ref` of the repo (forced) and returns the new commit sha.
pub fn fetch_bundle(repo: &Path, bundle: &Path, src_ref: &str, dst_ref: &str) -> Result<String> {
    let git = Git::shadow(repo);
    let file = bundle.to_string_lossy().into_owned();
    git.out(&[
        "fetch",
        "--no-tags",
        "--no-write-fetch-head",
        "-q",
        &file,
        &format!("+{src_ref}:{dst_ref}"),
    ])?;
    git.text(&["rev-parse", "--verify", &format!("{dst_ref}^{{commit}}")])
}
