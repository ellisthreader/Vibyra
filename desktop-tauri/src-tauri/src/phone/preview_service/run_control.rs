//! Running a project's desktop app from the phone or an agent. Vibyra starts
//! it itself, outside any agent sandbox, only after the owner approved that
//! exact command; its windows then open on the phone that asked.

use super::PreviewService;
use crate::phone::preview_grants::{run_fingerprint, run_root, runs::RunApprovalState};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::time::Instant;
use vibyra_core::preview::{
    desktop_target_for, inspect_project_with, DesktopCommand, PreviewStatus, PreviewTarget,
};

/// (absolute run folder, target ID), the way PreviewManager keys its runs.
pub(super) type RunKey = (PathBuf, String);

pub(super) struct ActiveRun {
    pub run_id: String,
    pub runtime_id: Option<u64>,
    /// Devices that asked for this run; each gets its windows to view.
    pub owners: Vec<String>,
    pub account: String,
    pub project_id: String,
    pub name: String,
    /// (device, window target) to the grant made for it.
    pub windows: HashMap<(String, String), String>,
    pub status: Option<PreviewStatus>,
    /// Set when the run ends; kept briefly so the phone can show why.
    pub ended: Option<Instant>,
}

pub(super) struct RunTarget {
    pub project_id: String,
    pub source_root: PathBuf,
    pub canonical_root: PathBuf,
    pub target: PreviewTarget,
    pub custom: Vec<DesktopCommand>,
    /// The approved command, when detection does not offer it itself.
    pub command: Option<DesktopCommand>,
    pub fingerprint: String,
}

impl RunTarget {
    /// What the owner is asked to approve: the exact command and folder.
    pub fn approval(&self, state: RunApprovalState) -> Value {
        json!({"approvalRequired":true,"changed":state == RunApprovalState::Changed,
            "name":self.target.name,"command":self.target.command,
            "cwd":display_folder(&self.canonical_root, &self.target.relative_root),
            "body":script_body(&self.canonical_root, &self.target),
            "commandVersion":self.version(),"targetId":self.target.id})
    }
    pub fn version(&self) -> &str {
        &self.fingerprint[..16]
    }
}

impl PreviewService {
    pub(super) fn resolve_run(
        &self,
        project_id: &str,
        root: Option<&Path>,
        target_id: Option<&str>,
        command: Option<&DesktopCommand>,
    ) -> Result<RunTarget, String> {
        let project = self
            .inner
            .workspace
            .read()
            .project_root(project_id)
            .ok_or("This project is not open on your computer")?;
        let source_root = run_root(&project, root.unwrap_or(&project))?;
        let canonical_root = source_root.canonicalize().map_err(|e| e.to_string())?;
        let folder = source_root.to_str().ok_or("Invalid project folder")?;
        let custom = self.inner.grants.custom_commands(project_id, &source_root);
        let (target, command) = match (command, target_id) {
            (Some(command), _) => {
                let target = desktop_target_for(folder, command).map_err(|e| e.to_string())?;
                let custom = target.id.contains("::desktop-cmd-");
                (target, custom.then(|| command.clone()))
            }
            (None, Some(id)) => {
                let targets = inspect_project_with(folder, &custom).map_err(|e| e.to_string())?;
                let target = targets
                    .targets
                    .into_iter()
                    .find(|target| target.id == id)
                    .ok_or("This app is no longer offered by the project")?;
                let command = custom.iter().find(|command| {
                    desktop_target_for(folder, command).is_ok_and(|found| found.id == id)
                });
                (target, command.cloned())
            }
            (None, None) => return Err("Say which app to run".into()),
        };
        if !target.runnable {
            return Err("This project target cannot be run".into());
        }
        let fingerprint = run_fingerprint(&canonical_root, &target, command.as_ref())?;
        Ok(RunTarget {
            project_id: project_id.into(),
            source_root,
            canonical_root,
            target,
            custom,
            command,
            fingerprint,
        })
    }

    /// Phone RPC `preview.run`. `approve` counts only with the command version
    /// the phone was shown, so a changed script is shown again first.
    pub fn run(&self, device: &str, params: &Value) -> Result<Value, String> {
        let project = params["projectId"].as_str().ok_or("Missing project")?;
        let target_id = params["targetId"].as_str().ok_or("Missing app")?;
        let run = self.resolve_run(project, None, Some(target_id), None)?;
        let state = self.run_approval(&run)?;
        if state != RunApprovalState::Approved {
            let shown = params["commandVersion"].as_str();
            if params["approve"] != true || shown != Some(run.version()) {
                return Ok(run.approval(state));
            }
            self.approve(device, &run)?;
        }
        self.launch_run(Some(device), &run)
    }

    pub(super) fn run_approval(&self, run: &RunTarget) -> Result<RunApprovalState, String> {
        self.inner.grants.run_state(
            &run.project_id,
            &run.source_root,
            &run.target.id,
            &run.fingerprint,
        )
    }

    pub(super) fn approve(&self, device: &str, run: &RunTarget) -> Result<(), String> {
        self.inner.grants.approve_run(
            device,
            &run.project_id,
            &run.source_root,
            &run.target.id,
            run.command.clone(),
            &run.fingerprint,
        )?;
        super::run_list::approvals_changed();
        Ok(())
    }
}

fn display_folder(root: &Path, relative: &str) -> String {
    let name = root
        .file_name()
        .map_or_else(String::new, |name| name.to_string_lossy().into_owned());
    if relative == "." {
        name
    } else {
        format!("{name}/{relative}")
    }
}

/// The package script behind `npm run <script>`, shown with the command.
fn script_body(root: &Path, target: &PreviewTarget) -> Option<String> {
    let words = target
        .command
        .as_deref()?
        .split_whitespace()
        .collect::<Vec<_>>();
    let script = match words.as_slice() {
        ["yarn", "run", script, ..] | [_, "run", script, ..] => *script,
        ["yarn", script, ..] => *script,
        _ => return None,
    };
    let text =
        std::fs::read_to_string(root.join(&target.relative_root).join("package.json")).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value["scripts"][script].as_str().map(str::to_owned)
}

#[cfg(all(test, unix))]
#[path = "run_tests.rs"]
pub(super) mod tests;
