use super::context::Subject;
use serde_json::Value;
use std::path::{Path, PathBuf};
use vibyra_core::approvals::Classified;

pub fn check(
    subject: &Subject,
    tool: &str,
    input: &Value,
    classified: &Classified,
) -> Result<(), String> {
    if let Some(cwd) = input.get("cwd").and_then(Value::as_str) {
        vibyra_core::agent_profiles::authorize(&subject.places, Path::new(cwd), false)
            .map_err(|e| e.to_string())?;
    }
    let write = classified.action == "file.write";
    if write && !subject.writes {
        return Err("This task is read-only.".into());
    }
    if write || ["Read", "Glob", "Grep", "LS", "NotebookRead"].contains(&tool) {
        let raw = vibyra_core::approvals::file_target(input);
        if raw.is_none() && ["Read", "NotebookRead"].contains(&tool) {
            return Err("This file operation must name a path.".into());
        }
        let raw = raw.as_deref().unwrap_or(&subject.cwd);
        let path = if Path::new(raw).is_absolute() {
            PathBuf::from(raw)
        } else {
            Path::new(&subject.cwd).join(raw)
        };
        vibyra_core::agent_profiles::authorize(&subject.places, &path, write)
            .map_err(|e| e.to_string())?;
    }
    if tool == "Bash"
        && input
            .get("dangerouslyDisableSandbox")
            .and_then(Value::as_bool)
            == Some(true)
    {
        return Err("This task cannot disable its sandbox.".into());
    }
    if !subject.writes && classified.risk != vibyra_core::approvals::Risk::Read {
        return Err("This task is read-only. Start a new task with suitable access.".into());
    }
    Ok(())
}
