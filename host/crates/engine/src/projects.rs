use crate::{
    state::{Project, OUTPUT_LIMIT},
    text, Engine,
};
use cap_std::{ambient_authority, fs::Dir};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    collections::HashSet,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::Arc,
};

pub(crate) fn configure(input: Vec<(String, PathBuf)>) -> Result<Vec<Project>, String> {
    if input.is_empty() || input.len() > 32 {
        return Err("approve between 1 and 32 projects locally".into());
    }
    let mut names = HashSet::new();
    let mut projects = Vec::new();
    for (name, path) in input {
        if name.is_empty()
            || name.len() > 80
            || name.chars().any(char::is_control)
            || !names.insert(name.clone())
        {
            return Err("project names must be unique and contain 1–80 bytes".into());
        }
        let path =
            std::fs::canonicalize(path).map_err(|e| format!("project is unavailable: {e}"))?;
        if !path.is_dir() {
            return Err("project must be a directory".into());
        }
        let digest = Sha256::digest(path.to_string_lossy().as_bytes());
        let id = format!("project-{:x}", digest)[..40].to_owned();
        if projects.iter().any(|project: &Project| project.id == id) {
            return Err("project was configured twice".into());
        }
        let directory =
            Arc::new(Dir::open_ambient_dir(&path, ambient_authority()).map_err(|e| e.to_string())?);
        projects.push(Project {
            id,
            name,
            path,
            directory,
        });
    }
    if serde_json::to_vec(&projects)
        .map_err(|e| e.to_string())?
        .len()
        > 16 * 1024
    {
        return Err(
            "project metadata exceeds the protocol limit; configure fewer project roots".into(),
        );
    }
    Ok(projects)
}

fn relative(path: &str) -> Result<&Path, String> {
    let parsed = Path::new(path);
    if path.len() > 2048
        || path.contains('\\')
        || path.contains('\0')
        || path.contains(':')
        || parsed
            .components()
            .any(|c| !matches!(c, Component::Normal(_) | Component::CurDir))
    {
        return Err("path must stay inside the approved project".into());
    }
    Ok(if path.is_empty() {
        Path::new(".")
    } else {
        parsed
    })
}

impl Engine {
    pub(crate) fn project(&self, params: &Value) -> Result<Project, String> {
        Ok(self
            .shared
            .lock()
            .resolve_project(text(params, "projectId")?)?
            .clone())
    }

    pub(crate) fn files(&self, params: &Value) -> Result<Value, String> {
        let project = self.project(params)?;
        let requested = params.get("path").and_then(Value::as_str).unwrap_or("");
        let path = relative(requested)?;
        let directory = project
            .directory
            .open_dir(path)
            .map_err(|e| e.to_string())?;
        let mut entries = Vec::new();
        let mut bytes = 0;
        let mut truncated = false;
        for (scanned, entry) in directory.entries().map_err(|e| e.to_string())?.enumerate() {
            if scanned == 1000 {
                truncated = true;
                break;
            }
            let entry = entry.map_err(|e| e.to_string())?;
            let name = entry.file_name().to_string_lossy().into_owned();
            if name == ".git" {
                continue;
            }
            let entry_path = if requested.is_empty() {
                name.clone()
            } else {
                format!("{requested}/{name}")
            };
            // Metadata and subsequent reads both use capability-relative walks;
            // a replaced symlink cannot redirect this operation outside the root.
            let Ok(entry_relative) = relative(&entry_path) else {
                continue;
            };
            let Ok(metadata) = project.directory.metadata(entry_relative) else {
                continue;
            };
            if !metadata.is_file() && !metadata.is_dir() {
                continue;
            }
            let item = json!({"path":entry_path,"name":name,
                "kind":if metadata.is_dir() {"directory"} else {"file"},"size":metadata.len()});
            bytes += serde_json::to_vec(&item).map_err(|e| e.to_string())?.len();
            if bytes > 48 * 1024 || entries.len() == 250 {
                truncated = true;
                break;
            }
            entries.push(item);
        }
        entries.sort_by(|a, b| a["name"].as_str().cmp(&b["name"].as_str()));
        Ok(json!({"entries":entries,"truncated":truncated}))
    }

    pub(crate) fn read(&self, params: &Value) -> Result<Value, String> {
        let project = self.project(params)?;
        let path = text(params, "path")?;
        let mut options = cap_std::fs::OpenOptions::new();
        options.read(true);
        #[cfg(unix)]
        {
            use cap_std::fs::OpenOptionsExt;
            options.custom_flags(libc::O_NONBLOCK);
        }
        let file = project
            .directory
            .open_with(relative(path)?, &options)
            .map_err(|e| e.to_string())?;
        if !file.metadata().map_err(|e| e.to_string())?.is_file() {
            return Err("only regular files can be read".into());
        }
        let mut bytes = Vec::new();
        file.take((OUTPUT_LIMIT + 1) as u64)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.contains(&0) {
            return Err("binary file; text preview unavailable".into());
        }
        let truncated = bytes.len() > OUTPUT_LIMIT;
        bytes.truncate(OUTPUT_LIMIT);
        let content = match String::from_utf8(bytes) {
            Ok(text) => text,
            Err(error) if truncated && error.utf8_error().error_len().is_none() => {
                String::from_utf8(error.as_bytes()[..error.utf8_error().valid_up_to()].to_vec())
                    .expect("valid prefix")
            }
            Err(_) => return Err("file is not UTF-8 text".into()),
        };
        Ok(json!({"path":path,"content":content,"truncated":truncated}))
    }
}
