//! Read-only manual selection; Run remains a separate version-bound approval.
use super::PreviewService;
use serde_json::{json, Value};
use std::path::PathBuf;
use vibyra_core::preview::{
    manual_preview_commands, manual_preview_path, DesktopCommand, ManualPreview,
};

impl PreviewService {
    pub(crate) fn manual_files(&self, params: &Value) -> Result<Value, String> {
        self.remote_control(&["preview:access", "files:read"], || {
            let (_, root, path) = self.manual_scope(params)?;
            let folder = manual_preview_path(&root, path).map_err(|e| e.to_string())?;
            if !folder.is_dir() {
                return Err("Choose a project folder".into());
            }
            let mut entries = Vec::new();
            for (index, item) in std::fs::read_dir(&folder)
                .map_err(|e| e.to_string())?
                .enumerate()
            {
                if index >= 10000 {
                    return Err(
                        "This folder has too many entries. Choose a smaller project folder.".into(),
                    );
                }
                let item = item.map_err(|e| e.to_string())?;
                let kind = item.file_type().map_err(|e| e.to_string())?;
                let name = item.file_name().to_string_lossy().into_owned();
                if kind.is_symlink()
                    || matches!(
                        name.as_str(),
                        ".git" | "node_modules" | ".expo" | ".vibyra-agent" | "vendor" | "target"
                    )
                {
                    continue;
                }
                let html =
                    name.to_lowercase().ends_with(".html") || name.to_lowercase().ends_with(".htm");
                if kind.is_dir() || (kind.is_file() && html) {
                    let relative = item
                        .path()
                        .strip_prefix(&root)
                        .map_err(|_| "Folder left the project")?
                        .to_string_lossy()
                        .replace('\\', "/");
                    entries.push(json!({"name":name,"path":relative,"directory":kind.is_dir()}));
                }
            }
            entries.sort_by(|a, b| {
                b["directory"]
                    .as_bool()
                    .cmp(&a["directory"].as_bool())
                    .then_with(|| a["name"].as_str().cmp(&b["name"].as_str()))
            });
            super::control_access::check()?;
            Ok(json!({"entries":entries}))
        })
    }
    pub(crate) fn manual_inspect(&self, params: &Value, native: bool) -> Result<Value, String> {
        self.remote_control(&["preview:access", "files:read"], || {
            let (project, root, path) = self.manual_scope(params)?;
            let commands = manual_preview_commands(&root, path).map_err(|e| e.to_string())?;
            let mut rows = Vec::new();
            for command in commands {
                let run = self.resolve_run(project, None, None, Some(&command))?;
                if !native && run.target.kind == vibyra_core::preview::PreviewTargetKind::Desktop {
                    continue;
                }
                let state = self.run_approval(&run)?;
                let mut row = run.approval(state);
                row["approvalRequired"] =
                    json!(state != crate::phone::preview_grants::runs::RunApprovalState::Approved);
                row["projectId"] = json!(project);
                row["framework"] = json!(run.target.framework);
                row["kind"] = json!(if run.target.kind
                    == vibyra_core::preview::PreviewTargetKind::Desktop
                {
                    "window"
                } else {
                    "web"
                });
                row["runState"] = json!("idle");
                row["manual"] = json!(command.manual);
                rows.push(row);
            }
            super::control_access::check()?;
            Ok(json!({"runnable":rows}))
        })
    }
    fn manual_scope<'a>(&self, params: &'a Value) -> Result<(&'a str, PathBuf, &'a str), String> {
        let project = params["projectId"].as_str().ok_or("Select a project")?;
        let root = self
            .inner
            .workspace
            .read()
            .project_root(project)
            .ok_or("This project is not open on your computer")?;
        let root = root.canonicalize().map_err(|e| e.to_string())?;
        let path = params["path"].as_str().unwrap_or(".");
        Ok((project, root, path))
    }
}

pub(super) fn command(params: &Value) -> Result<Option<DesktopCommand>, String> {
    if params.get("manual").is_none_or(Value::is_null) {
        return Ok(None);
    }
    super::control_access::permission("files:read")?;
    let manual: ManualPreview = serde_json::from_value(params["manual"].clone())
        .map_err(|_| "Invalid manual preview selection")?;
    Ok(Some(DesktopCommand {
        relative_root: ".".into(),
        argv: Vec::new(),
        manual: Some(manual),
    }))
}
