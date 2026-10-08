use super::{
    files, objects, HeldBack, Skipped, Snapshot, SnapshotOptions, SnapshotOutcome, SNAP_REF,
};
use crate::error::{Result, SyncError};
use crate::git::{ensure_shadow, Git};
use crate::scan::{content_reason, MAX_SCAN_BYTES};
use crate::secrets::secret_reason_with;
use std::path::Path;

/// Builds the next snapshot of `root` in the shadow repo at `shadow_dir`, advancing `refs/vibyra/snap`
/// unless the tree is identical to the previous snapshot's.
pub fn take_snapshot(
    root: &Path,
    shadow_dir: &Path,
    opts: &SnapshotOptions,
) -> Result<SnapshotOutcome> {
    if !root.is_dir() {
        return Err(SyncError::Invalid(format!(
            "{} is not a folder.",
            root.display()
        )));
    }
    let shadow = ensure_shadow(shadow_dir)?;
    let listing = files::list(root, &shadow)?;
    let mut skipped: Vec<Skipped> = listing
        .odd
        .into_iter()
        .map(|(path, reason)| Skipped {
            path,
            reason: reason.into(),
        })
        .collect();
    let mut held_back = vec![];
    let mut eligible = vec![];
    let mut total = 0u64;
    for path in listing.paths {
        let full = root.join(&path);
        let Ok(meta) = std::fs::symlink_metadata(&full) else {
            continue;
        };
        if meta.file_type().is_symlink() {
            skipped.push(Skipped {
                path,
                reason: "symlink".into(),
            });
        } else if !meta.is_file() {
            // A directory (submodule or nested checkout) or a special file.
        } else if let Some(reason) = secret_reason_with(&path, opts.include_env) {
            held_back.push(HeldBack {
                path,
                reason: reason.into(),
            });
        } else if meta.len() > opts.max_file_bytes {
            skipped.push(Skipped {
                path,
                reason: format!("larger than {} MiB", opts.max_file_bytes >> 20),
            });
        } else {
            total += meta.len();
            eligible.push((path, full));
        }
    }
    if total > opts.max_project_bytes {
        return Ok(SnapshotOutcome::TooLarge {
            bytes: total,
            cap: opts.max_project_bytes,
        });
    }
    let objects_dir = shadow_dir.join("objects");
    let mut index_lines: Vec<u8> = vec![];
    let (mut count, mut bytes) = (0usize, 0u64);
    for (path, full) in eligible {
        // Read once, judge, then store those very bytes.
        let Ok(data) = std::fs::read(&full) else {
            skipped.push(Skipped {
                path,
                reason: "could not be read".into(),
            });
            continue;
        };
        if let Some(reason) = if (data.len() as u64) <= MAX_SCAN_BYTES {
            content_reason(&data)
        } else {
            None
        } {
            held_back.push(HeldBack {
                path,
                reason: reason.into(),
            });
            continue;
        }
        let sha = objects::write_blob(&objects_dir, &data)?;
        let mode = if is_executable(&full) {
            "100755"
        } else {
            "100644"
        };
        index_lines.extend_from_slice(format!("{mode} {sha}\t{path}\0").as_bytes());
        count += 1;
        bytes += data.len() as u64;
    }
    held_back.sort_by(|a, b| a.path.cmp(&b.path));
    if count == 0 {
        return Ok(SnapshotOutcome::NoFiles { held_back });
    }
    let tree = write_tree(shadow_dir, &shadow, &index_lines)?;
    let parent = shadow.try_text(&[
        "rev-parse",
        "-q",
        "--verify",
        &format!("{SNAP_REF}^{{commit}}"),
    ]);
    let parent_tree = parent
        .as_ref()
        .and_then(|p| shadow.try_text(&["rev-parse", &format!("{p}^{{tree}}")]));
    let (commit, created) = match (&parent, parent_tree) {
        (Some(p), Some(t)) if t == tree => (p.clone(), false),
        _ => {
            let mut args = vec!["commit-tree", &tree[..], "-m", "Vibyra sync snapshot"];
            if let Some(p) = &parent {
                args.extend(["-p", p]);
            }
            let commit = shadow.text(&args)?;
            shadow.out(&["update-ref", SNAP_REF, &commit])?;
            (commit, true)
        }
    };
    if created {
        // Loose objects pile up with every snapshot; `gc --auto` packs them past the threshold.
        let _ = shadow.out(&["gc", "--auto", "--quiet"]);
    }
    Ok(SnapshotOutcome::Taken(Snapshot {
        commit,
        tree,
        parent,
        created,
        held_back,
        skipped,
        files: count,
        bytes,
    }))
}

fn write_tree(shadow_dir: &Path, shadow: &Git, index_lines: &[u8]) -> Result<String> {
    let index = shadow_dir.join(format!("vibyra-index-{}", uuid::Uuid::new_v4().simple()));
    let git = shadow.clone().with_index(&index);
    let result = git
        .go(
            &["update-index", "-z", "--add", "--index-info"],
            Some(index_lines),
        )
        .and_then(|_| git.text(&["write-tree"]));
    let _ = std::fs::remove_file(&index);
    result
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(path).is_ok_and(|m| m.permissions().mode() & 0o111 != 0)
}
#[cfg(not(unix))]
fn is_executable(_: &Path) -> bool {
    false
}
