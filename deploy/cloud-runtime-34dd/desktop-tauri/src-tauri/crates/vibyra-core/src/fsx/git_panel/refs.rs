//! Names that reach Git as arguments.
use super::GitResult;
use crate::fsx::ship::git::text;
use crate::fsx::ship::ShipError;
use std::path::Path;

const MAX_NAME: usize = 120;

/// A branch name Vibyra will pass to Git: Git's own `check-ref-format` rules
/// plus a stricter surface (printable, no spaces, never `-`-led, bounded).
pub(crate) fn validate_branch(name: &str) -> GitResult<()> {
    let bad = |why: &str| {
        Err(ShipError::new(format!(
            "That is not a usable branch name: {why}."
        )))
    };
    if name.is_empty() || name.len() > MAX_NAME {
        return bad("it must be 1 to 120 characters");
    }
    if name.starts_with('-') || name.starts_with('/') || name.ends_with('/') || name.ends_with('.')
    {
        return bad("it cannot start with - or / or end with / or .");
    }
    if name
        .chars()
        .any(|c| c.is_control() || c.is_whitespace() || "~^:?*[\\".contains(c))
    {
        return bad("no spaces or special characters");
    }
    if name.contains("..") || name.contains("@{") || name.contains("//") || name == "@" {
        return bad("it cannot contain .. or @{");
    }
    if name
        .split('/')
        .any(|part| part.starts_with('.') || part.ends_with(".lock"))
    {
        return bad("no part may start with . or end with .lock");
    }
    Ok(())
}

/// The repository's own verdict, run only after our checks passed.
pub(crate) fn check_with_git(root: &Path, name: &str) -> GitResult<()> {
    let full = format!("refs/heads/{name}");
    text(root, &["check-ref-format", &full])
        .map(|_| ())
        .map_err(|_| ShipError::new("Git does not accept that branch name."))
}

pub(crate) fn branch_exists(root: &Path, name: &str) -> bool {
    let full = format!("refs/heads/{name}");
    text(root, &["rev-parse", "--verify", "--quiet", &full]).is_ok()
}
