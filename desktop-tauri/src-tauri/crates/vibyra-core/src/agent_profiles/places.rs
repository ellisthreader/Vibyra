//! Which folders an agent may touch, and the check that says so.
//!
//! This is the file that decides whether a path is inside a grant, so it is
//! written against the two ways that check is normally got wrong:
//!
//! * **String prefixes.** `/home/ana-old` starts with `/home/ana`, and a
//!   `starts_with` on the text would call it granted. The comparison here is
//!   component-wise, which is what `Path::starts_with` already does.
//! * **Symlinks that move.** Canonicalising once at grant time proves where a
//!   path pointed *then*. A link swapped afterwards points somewhere else, and
//!   the turn that follows would walk straight through it. So the target is
//!   canonicalised again at the moment of the check, every time, and it is the
//!   resolved path that has to be inside the grant.
//!
//! A grant is stored canonical for the same reason: two spellings of one
//! folder must not read as two different permissions.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::agent_model::PlaceAccess;
use crate::error::{CoreError, CoreResult};

/// One folder an agent has been granted, as stored.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPlace {
    pub id: String,
    pub agent_id: String,
    /// Always canonical — resolved and symlink-free at the time of the grant.
    pub path: String,
    pub access: PlaceAccess,
    pub label: String,
    pub created_ms: i64,
}

/// Resolves a folder the user picked into the canonical form a grant stores.
///
/// Refuses anything that is not a directory that exists. A grant over a file
/// would be meaningless (the adapters hand directories to `--add-dir`), and a
/// grant over a path that does not exist yet would be a grant over whatever
/// later takes that name.
pub fn canonical_place(path: &str) -> CoreResult<PathBuf> {
    let raw = Path::new(path);
    let resolved = std::fs::canonicalize(raw)
        .map_err(|error| CoreError::InvalidPath(format!("{path}: {error}")))?;
    if !resolved.is_dir() {
        return Err(CoreError::InvalidPath(format!(
            "{path} is not a folder, so it cannot be granted as a place"
        )));
    }
    Ok(resolved)
}

/// Whether `candidate` lies inside `root`, both already canonical.
///
/// A root is inside itself: granting a folder grants the folder.
pub fn within(root: &Path, candidate: &Path) -> bool {
    candidate.starts_with(root)
}

/// The grant that authorises `target`, or an error naming what was refused.
///
/// `target` is canonicalised here rather than trusted, which is what makes the
/// check survive a symlink swapped in after the grant was made. A target that
/// does not exist yet — the normal case for a file about to be created — is
/// resolved through its nearest existing ancestor instead, so creating
/// `<place>/new.txt` is allowed while creating `<link-out>/new.txt` is not.
pub fn authorize<'a>(
    places: &'a [AgentPlace],
    target: &Path,
    write: bool,
) -> CoreResult<&'a AgentPlace> {
    let resolved = resolve_for_check(target)?;
    let mut read_only_match = false;
    for place in places {
        let root = Path::new(&place.path);
        if !within(root, &resolved) {
            continue;
        }
        if !write || place.access == PlaceAccess::ReadWrite {
            return Ok(place);
        }
        read_only_match = true;
    }
    Err(CoreError::InvalidPath(if read_only_match {
        format!(
            "{} is in a place this agent may only read",
            resolved.display()
        )
    } else {
        format!(
            "{} is outside every place this agent was granted",
            resolved.display()
        )
    }))
}

/// Canonicalises as much of `target` as exists, then re-attaches the rest.
///
/// The existing part is what a symlink could have moved, so that is the part
/// that must be resolved. The remainder is names that do not exist yet and so
/// cannot be links to anywhere.
fn resolve_for_check(target: &Path) -> CoreResult<PathBuf> {
    if let Ok(resolved) = std::fs::canonicalize(target) {
        return Ok(resolved);
    }
    let mut tail = Vec::new();
    let mut cursor = target;
    loop {
        let Some(parent) = cursor.parent() else {
            return Err(CoreError::InvalidPath(format!(
                "{} could not be resolved to a real location",
                target.display()
            )));
        };
        let Some(name) = cursor.file_name() else {
            return Err(CoreError::InvalidPath(format!(
                "{} is not a path a file can be written to",
                target.display()
            )));
        };
        tail.push(name.to_owned());
        if let Ok(resolved) = std::fs::canonicalize(parent) {
            let mut full = resolved;
            for name in tail.iter().rev() {
                full.push(name);
            }
            return Ok(full);
        }
        cursor = parent;
    }
}

/// The `--add-dir` list for a turn: every place the agent may use, with the
/// writable ones first so a provider that caps the count keeps the useful end.
pub fn directory_arguments(places: &[AgentPlace], permission_writes: bool) -> Vec<String> {
    let mut ordered: Vec<&AgentPlace> = places.iter().collect();
    ordered.sort_by_key(|place| match place.access {
        PlaceAccess::ReadWrite if permission_writes => 0,
        PlaceAccess::ReadWrite => 1,
        PlaceAccess::Read => 2,
    });
    ordered
        .into_iter()
        .map(|place| place.path.clone())
        .collect()
}
