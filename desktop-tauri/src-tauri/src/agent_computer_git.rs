use super::{safe_path, Grant};
use serde_json::{json, Value};
use std::path::{Component, Path};

const MAX_FILES: usize = 50;
const MAX_DIFF_BYTES: usize = 8192;

pub(super) fn read(grant: &Grant, operation: &str, args: &Value) -> Result<Value, String> {
    let root = grant
        .path
        .to_str()
        .ok_or("The granted folder is unavailable")?;
    let changes =
        vibyra_core::fsx::git_changes::safe_changes(root).map_err(|error| error.to_string())?;
    let repository = Path::new(&changes.root)
        .canonicalize()
        .map_err(|_| "The Git repository is unavailable")?;
    if repository != grant.path {
        return Err(
            "Choose the Git repository root on this computer to inspect its changes.".into(),
        );
    }
    let visible: Vec<_> = changes
        .files
        .iter()
        .filter(|file| {
            permitted(&grant.path, &file.path)
                && file
                    .previous_path
                    .as_deref()
                    .is_none_or(|old| permitted(&grant.path, old))
        })
        .collect();
    if operation == "git_status" {
        if !args.as_object().is_some_and(serde_json::Map::is_empty)
            && !args.as_array().is_some_and(Vec::is_empty)
        {
            return Err("Git status takes no arguments.".into());
        }
        return Ok(
            json!({"files": visible.iter().take(MAX_FILES).collect::<Vec<_>>(),
            "truncated": visible.len() > MAX_FILES}),
        );
    }
    let path = args["path"].as_str().ok_or("Choose a changed file.")?;
    if !visible.iter().any(|file| file.path == path) {
        return Err("This file is not a visible project change.".into());
    }
    let diff = vibyra_core::fsx::git_changes::safe_change_preview(root, path)
        .map_err(|error| error.to_string())?;
    if diff.len() > MAX_DIFF_BYTES {
        return Err("This diff is too large for Agent Computer (8 KB maximum).".into());
    }
    Ok(json!({"path":path,"diff":diff}))
}

fn permitted(root: &Path, path: &str) -> bool {
    if !safe_path(path) || path.is_empty() {
        return false;
    }
    let mut current = root.to_path_buf();
    for component in Path::new(path).components() {
        let Component::Normal(name) = component else {
            return false;
        };
        current.push(name);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => return false,
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => break,
            Err(_) => return false,
        }
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;

    fn grant(root: &Path) -> Grant {
        Grant {
            id: "123e4567-e89b-12d3-a456-426614174000".into(),
            agent_id: "123e4567-e89b-12d3-a456-426614174001".into(),
            host_id: "host".into(),
            account_scope: "account".into(),
            label: "Project".into(),
            path: root.canonicalize().unwrap(),
            source_path: None,
            can_write: false,
            revoked: false,
        }
    }

    #[test]
    fn git_reads_stay_inside_the_granted_repository_and_hide_private_paths() {
        let directory = tempfile::tempdir().unwrap();
        let root = directory.path();
        assert!(Command::new("git")
            .args(["init", "--quiet"])
            .current_dir(root)
            .status()
            .unwrap()
            .success());
        std::fs::write(root.join("README.md"), "Public project note\n").unwrap();
        std::fs::write(root.join(".env"), "SECRET=private\n").unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(".env", root.join("leak.txt")).unwrap();
        let access = grant(root);
        let status = read(&access, "git_status", &json!({})).unwrap();
        assert_eq!(status, read(&access, "git_status", &json!([])).unwrap());
        let files = status["files"].as_array().unwrap();
        assert_eq!(files.len(), 1, "{status}");
        assert_eq!(files[0]["path"], "README.md");
        let diff = read(&access, "git_diff", &json!({"path":"README.md"})).unwrap();
        assert!(diff["diff"]
            .as_str()
            .unwrap()
            .contains("Public project note"));
        assert!(read(&access, "git_diff", &json!({"path":".env"})).is_err());
        assert!(read(&access, "git_status", &json!({"unexpected":true})).is_err());
        std::fs::create_dir(root.join("nested")).unwrap();
        assert!(read(&grant(&root.join("nested")), "git_status", &json!({})).is_err());
    }
}
