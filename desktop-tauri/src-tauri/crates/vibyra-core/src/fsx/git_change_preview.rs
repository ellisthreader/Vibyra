use super::{changes, git, safe_changes, safe_git, RECENT};
use crate::{CoreError, CoreResult};
use std::path::Path;

pub fn change_preview(root: &str, path: &str) -> CoreResult<String> {
    preview(root, path, false)
}

pub fn safe_change_preview(root: &str, path: &str) -> CoreResult<String> {
    preview(root, path, true)
}

fn preview(root: &str, path: &str, safe: bool) -> CoreResult<String> {
    // Only a list read for this same project counts: the caller cannot select
    // another project's file. A path missing from a recent list re-reads it.
    let list = if safe {
        safe_changes(root)?
    } else {
        RECENT
            .get(&root.to_string())
            .filter(|list| list.files.iter().any(|file| file.path == path))
            .map(Ok)
            .unwrap_or_else(|| changes(root))?
    };
    let file = list
        .files
        .iter()
        .find(|file| file.path == path)
        .ok_or_else(|| {
            CoreError::InvalidPath("This file is no longer changed. Refresh the list.".into())
        })?;
    let repo = Path::new(&list.root);
    if file.status == "??" {
        let full = repo.join(path).canonicalize()?;
        if !full.starts_with(Path::new(root).canonicalize()?) {
            return Err(CoreError::InvalidPath(
                "File points outside this project".into(),
            ));
        }
        let preview = super::super::read_file_preview(&full.to_string_lossy(), 256 * 1024)?;
        return Ok(format!(
            "New file: {path}\n\n{}{}",
            preview.content,
            if preview.truncated {
                "\n\n[Preview truncated]"
            } else {
                ""
            }
        ));
    }
    let mut args = vec![
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-color",
        "--cached",
        "--",
        path,
    ];
    if let Some(previous) = &file.previous_path {
        args.push(previous);
    }
    let run = if safe { safe_git } else { git };
    let staged = run(repo, &args, 512 * 1024)?;
    args.remove(4);
    let working = run(repo, &args, 512 * 1024)?;
    let mut result = Vec::new();
    if !staged.is_empty() {
        result.push(format!("Staged changes\n{staged}"));
    }
    if !working.is_empty() {
        result.push(format!("Working changes\n{working}"));
    }
    Ok(if result.is_empty() {
        "No text diff is available for this change.".into()
    } else {
        result.join("\n")
    })
}
