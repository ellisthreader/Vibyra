use crate::agent_computer_store::Grant;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::{Component, Path};

#[path = "agent_computer_git.rs"]
mod git;
#[path = "agent_computer_write.rs"]
mod write;

/// Executes only read operations inside the Mac's own grant. A cloud grant
/// without this local record never reaches this function.
pub fn open(grant: &Grant, state_dir: &Path) -> Result<vibyra_engine::Engine, String> {
    grant.validate_path()?;
    if grant.can_write {
        vibyra_engine::Engine::new(
            state_dir.join(&grant.id),
            vec![(grant.label.clone(), grant.path.clone())],
        )
    } else {
        vibyra_engine::Engine::new_read_only(
            state_dir.join(&grant.id),
            grant.label.clone(),
            grant.path.clone(),
        )
    }
}

pub fn read(grant: &Grant, engine: &vibyra_engine::Engine, operation: &str, args: &Value) -> Value {
    match perform(grant, engine, operation, args) {
        Ok(value) => value,
        Err(error) => json!({"error":error}),
    }
}

pub fn edit(grant: &Grant, engine: &vibyra_engine::Engine, tool: &Value) -> Value {
    match write::perform(grant, engine, tool) {
        Ok(value) => value,
        Err(error) => json!({"error":error}),
    }
}

pub(crate) fn review_git(grant: &Grant, operation: &str, args: &Value) -> Result<Value, String> {
    grant.validate_path()?;
    git::read(grant, operation, args)
}

fn perform(
    grant: &Grant,
    engine: &vibyra_engine::Engine,
    operation: &str,
    args: &Value,
) -> Result<Value, String> {
    grant.validate_path()?;
    if matches!(operation, "git_status" | "git_diff") {
        let result = git::read(grant, operation, args)?;
        if result.to_string().len() > 15000 {
            return Err("This result is too large. Narrow the request.".into());
        }
        return Ok(result);
    }
    if !matches!(operation, "list_files" | "read_file" | "search_files") {
        return Err("This computer grant only allows project reads.".into());
    }
    let path = args["path"].as_str().unwrap_or("");
    if operation != "search_files" && !safe_path(path) {
        return Err("This path is outside the granted project or is private.".into());
    }
    if operation != "search_files" && has_symlink(&grant.path, path) {
        return Err("Agent Computer cannot follow a symbolic link.".into());
    }
    let project = engine.handle("agent-computer", "host.state", json!({}))?["projects"][0]["id"]
        .as_str()
        .ok_or("The project is unavailable")?
        .to_owned();
    let params = if operation == "search_files" {
        json!({"projectId":project,"query":args["query"]})
    } else {
        json!({"projectId":project,"path":path})
    };
    let method = match operation {
        "list_files" => "project.files",
        "read_file" => "project.read",
        "search_files" => "project.search",
        _ => unreachable!(),
    };
    let mut result = engine.handle("agent-computer", method, params)?;
    if operation == "list_files" {
        if let Some(entries) = result["entries"].as_array_mut() {
            entries.retain(|entry| {
                entry["name"].as_str().is_some_and(safe_name)
                    && entry["path"]
                        .as_str()
                        .is_some_and(|path| !has_symlink(&grant.path, path))
            });
            entries.truncate(50);
        }
    }
    if operation == "search_files" {
        if let Some(matches) = result["matches"].as_array_mut() {
            matches.retain(|entry| entry["path"].as_str().is_some_and(safe_path));
        }
    }
    if operation == "read_file" {
        let content = result["content"].as_str().ok_or("No text returned")?;
        if result["truncated"] == true || content.len() > 8192 {
            return Err("This file is too large for Agent Computer (8 KB maximum).".into());
        }
        result["sha256"] = json!(format!("{:x}", Sha256::digest(content.as_bytes())));
    }
    if result.to_string().len() > 15000 {
        return Err("This result is too large. Narrow the request.".into());
    }
    Ok(result)
}

fn safe_name(name: &str) -> bool {
    !name.starts_with('.') && !matches!(name, "node_modules" | "vendor")
}

fn safe_path(path: &str) -> bool {
    path.len() <= 2048 && !path.contains('\\') && !path.contains(':')
        && !path.contains('\0') && Path::new(path).components().all(|component|
            matches!(component, Component::Normal(name) if safe_name(&name.to_string_lossy())))
}

fn has_symlink(root: &Path, path: &str) -> bool {
    let mut current = root.to_path_buf();
    for component in Path::new(path).components() {
        let Component::Normal(name) = component else {
            return true;
        };
        current.push(name);
        match std::fs::symlink_metadata(&current) {
            Ok(metadata) if metadata.file_type().is_symlink() => return true,
            Ok(_) => {}
            Err(_) => return true,
        }
    }
    false
}

#[cfg(test)]
#[path = "agent_computer_tools_tests.rs"]
mod tests;
