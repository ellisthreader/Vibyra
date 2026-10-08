//! The newest pending cloud change of a project as base/theirs file lists for the three-way review.

use super::cloud_files::{self, CloudFile};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::Serialize;
use vibyra_sync::{ChangeStatus, CloudChange, Engine, ProjectRef, Side};

const MAX_FILE_BYTES: usize = 1_048_576;
const MAX_TOTAL_BYTES: usize = 20_971_520;

/// A file the cloud changed that this review cannot apply (listed, never written).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Unapplied {
    pub path: String,
    pub reason: String,
}

pub struct Collected {
    pub change: CloudChange,
    pub base: Vec<CloudFile>,
    pub theirs: Vec<CloudFile>,
    pub unapplied: Vec<Unapplied>,
}

fn file(path: &str, bytes: &[u8], executable: bool) -> CloudFile {
    CloudFile {
        path: path.to_string(),
        content: STANDARD.encode(bytes),
        sha256: cloud_files::hash(bytes),
        executable,
    }
}

fn skip(list: &mut Vec<Unapplied>, path: &str, reason: &str) {
    list.push(Unapplied {
        path: path.to_string(),
        reason: reason.to_string(),
    });
}

/// The newest pending cloud change of a project as base/theirs file lists, or `None` when there is none.
/// Files the shared transfer rules refuse (credentials, dependency folders, symlinks, over 1 MiB) are
/// reported in `unapplied` and left out of both lists.
pub fn collect(engine: &Engine, project: &ProjectRef) -> Result<Option<Collected>, String> {
    let Some(change) = engine.pending_cloud_changes(project).last().cloned() else {
        return Ok(None);
    };
    let base_tree = engine
        .cloud_tree(project, Side::Base)
        .map_err(|e| e.to_string())?;
    let (mut base, mut theirs, mut unapplied) = (Vec::new(), Vec::new(), Vec::new());
    let mut total = 0usize;
    for changed in &change.files {
        let path = changed.path.as_str();
        if cloud_files::relative(path).is_err() {
            skip(
                &mut unapplied,
                path,
                "A credential or dependency file; it is never written from the cloud",
            );
            continue;
        }
        if let Err(error) = cloud_files::read(&project.root, path) {
            skip(&mut unapplied, path, &error);
            continue;
        }
        let was = engine
            .cloud_file(project, Side::Base, path)
            .map_err(|e| e.to_string())?;
        let now = if changed.status == ChangeStatus::Deleted {
            None
        } else {
            engine
                .cloud_file(project, Side::Theirs, path)
                .map_err(|e| e.to_string())?
        };
        let size = was
            .as_ref()
            .map_or(0, Vec::len)
            .max(now.as_ref().map_or(0, Vec::len));
        if size > MAX_FILE_BYTES {
            skip(
                &mut unapplied,
                path,
                "Larger than 1 MiB; review it in the cloud or by hand",
            );
            continue;
        }
        total += was.as_ref().map_or(0, Vec::len) + now.as_ref().map_or(0, Vec::len);
        if total > MAX_TOTAL_BYTES {
            skip(&mut unapplied, path, "Too much changed to review at once");
            continue;
        }
        if let Some(bytes) = was {
            let executable = base_tree.get(path).is_some_and(|e| e.mode == "100755");
            base.push(file(path, &bytes, executable));
        }
        if let Some(bytes) = now {
            theirs.push(file(path, &bytes, changed.mode == "100755"));
        }
    }
    base.sort_by(|a, b| a.path.cmp(&b.path));
    theirs.sort_by(|a, b| a.path.cmp(&b.path));
    cloud_files::validate(&base)?;
    cloud_files::validate(&theirs)?;
    Ok(Some(Collected {
        change,
        base,
        theirs,
        unapplied,
    }))
}
