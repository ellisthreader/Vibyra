//! Replace across files. Each file is read again, must still have the hash the
//! search showed, and is saved through the editor's own atomic hash-checked
//! write. Paths stay inside the project root, nothing is written through a
//! link, and a file that changed meanwhile is left alone and reported.

use std::io::Read;
use std::path::Path;

use serde::{Deserialize, Serialize};

use super::links::{open_no_follow, LinkGuard};
use super::matcher::{Matcher, SearchOptions};
use super::scope::split;
use super::{sha256_hex, write_file, CONFLICT_PREFIX, EDIT_LIMIT_BYTES};
use crate::{CoreError, CoreResult};

pub const MAX_REPLACE_FILES: usize = 500;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceTarget {
    pub path: String,
    pub expected_hash: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ReplaceResult {
    pub path: String,
    pub replaced: usize,
    pub hash: Option<String>,
    pub error: Option<String>,
    /// The file changed since it was searched.
    pub conflict: bool,
}

struct Refused {
    message: String,
    conflict: bool,
}

fn refuse(message: &str) -> Refused {
    Refused {
        message: message.into(),
        conflict: false,
    }
}

impl From<CoreError> for Refused {
    fn from(error: CoreError) -> Self {
        let message = match error {
            CoreError::InvalidPath(text) | CoreError::Task(text) => text,
            other => other.to_string(),
        };
        Refused {
            conflict: message.starts_with(CONFLICT_PREFIX),
            message,
        }
    }
}

fn replace_one(
    guard: &mut LinkGuard,
    root: &Path,
    matcher: &Matcher,
    with: &str,
    target: &ReplaceTarget,
) -> Result<(usize, Option<String>), Refused> {
    let (_, rel) = split(root, &target.path)?;
    let path = guard.path_of(&rel)?;
    let meta =
        std::fs::symlink_metadata(&path).map_err(|_| refuse("This file no longer exists."))?;
    if !meta.is_file() {
        return Err(refuse("This is a link or not a file, so it is left alone."));
    }
    if meta.len() > EDIT_LIMIT_BYTES {
        return Err(refuse(
            "This file is larger than 2 MB and is not edited here.",
        ));
    }
    let mut bytes = Vec::new();
    open_no_follow(&path)
        .and_then(|file| file.take(EDIT_LIMIT_BYTES + 1).read_to_end(&mut bytes))
        .map_err(|_| refuse("This file could not be read."))?;
    if !sha256_hex(&bytes).eq_ignore_ascii_case(&target.expected_hash) {
        return Err(Refused {
            message: "This file changed since it was searched.".into(),
            conflict: true,
        });
    }
    let text = match std::str::from_utf8(&bytes) {
        Ok(text) if !bytes[..bytes.len().min(8192)].contains(&0) => text,
        _ => return Err(refuse("This file is not plain UTF-8 text.")),
    };
    let (replaced, count) = matcher.replace_text(text, with);
    if count == 0 {
        return Ok((0, None));
    }
    let rel_text = rel.to_string_lossy().into_owned();
    let saved = write_file(root, &rel_text, &replaced, Some(&target.expected_hash))?;
    Ok((count, Some(saved.hash)))
}

/// Replaces in each listed file on its own: one that cannot be changed is
/// reported and the others still are.
pub fn replace_in_files(
    root: &Path,
    options: &SearchOptions,
    targets: &[ReplaceTarget],
) -> CoreResult<Vec<ReplaceResult>> {
    let matcher = Matcher::new(options)?;
    let with = options
        .replacement
        .as_deref()
        .ok_or_else(|| CoreError::InvalidPath("Type what to replace it with.".into()))?;
    if targets.is_empty() || targets.len() > MAX_REPLACE_FILES {
        return Err(CoreError::InvalidPath(
            "Choose between 1 and 500 files.".into(),
        ));
    }
    let root = root.canonicalize()?;
    let mut guard = LinkGuard::new(&root);
    Ok(targets
        .iter()
        .map(|target| {
            let done = replace_one(&mut guard, &root, &matcher, with, target);
            let path = target.path.clone();
            match done {
                Ok((replaced, hash)) => ReplaceResult {
                    path,
                    replaced,
                    hash,
                    error: None,
                    conflict: false,
                },
                Err(refused) => ReplaceResult {
                    path,
                    replaced: 0,
                    hash: None,
                    error: Some(refused.message),
                    conflict: refused.conflict,
                },
            }
        })
        .collect())
}

#[cfg(test)]
#[path = "replace_tests.rs"]
mod tests;
