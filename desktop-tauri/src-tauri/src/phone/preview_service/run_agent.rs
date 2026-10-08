//! The host side of the agent's `vibyra_run_app` tool. An agent only names the
//! app; Vibyra decides what that runs, and an unapproved command waits for the
//! owner's tap on an exact plan that is checked again before it starts.

use super::run_control::RunTarget;
use super::PreviewService;
use crate::phone::preview_grants::runs::RunApprovalState;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use vibyra_core::preview::{parse_desktop_command, DesktopCommand};
use vibyra_engine::{RunOutcome, RunRequest};

const PLAN_TTL: Duration = Duration::from_secs(10 * 60);
const MAX_PLANS: usize = 32;

/// What the owner is being asked to approve, exactly.
pub(super) struct Plan {
    account: String,
    project: String,
    root: PathBuf,
    target: String,
    command: Option<DesktopCommand>,
    fingerprint: String,
    created: Instant,
}

impl PreviewService {
    pub(crate) fn agent_run(&self, request: &RunRequest) -> Result<RunOutcome, String> {
        if let Some(token) = &request.approve_token {
            return self.run_approved_plan(request, token);
        }
        let root = request.root.as_deref().map(Path::new);
        let run = match (&request.target, &request.command) {
            (Some(target), None) if target.contains("::") => {
                self.resolve_run(&request.project, root, Some(target), None)?
            }
            (Some(text), None) | (_, Some(text)) => {
                let command = parse_desktop_command(".", text).map_err(|e| e.to_string())?;
                self.resolve_run(&request.project, root, None, Some(&command))?
            }
            (None, None) => return Err(self.offer(&request.project, root)),
        };
        match self.run_approval(&run)? {
            RunApprovalState::Approved => Ok(RunOutcome::Started(
                self.launch_run(Some(&request.device), &run)?,
            )),
            state => {
                let token = self.remember_plan(&run)?;
                let approval = run.approval(state);
                let text = |key: &str| approval[key].as_str().unwrap_or_default().to_owned();
                Ok(RunOutcome::NeedsApproval {
                    token,
                    name: text("name"),
                    command: text("command"),
                    cwd: text("cwd"),
                    body: approval["body"].as_str().map(str::to_owned),
                })
            }
        }
    }

    /// The owner approved on their device: run the plan they saw, and only if
    /// nothing it runs changed since.
    fn run_approved_plan(&self, request: &RunRequest, token: &str) -> Result<RunOutcome, String> {
        let plan = self
            .inner
            .plans
            .lock()
            .remove(token)
            .filter(|plan| plan.created.elapsed() < PLAN_TTL)
            .ok_or("That approval expired. Ask to run the app again.")?;
        if self.inner.grants.active_account()? != plan.account {
            return Err("The computer's account changed. Ask to run the app again.".into());
        }
        let run = match &plan.command {
            Some(command) => {
                self.resolve_run(&plan.project, Some(&plan.root), None, Some(command))?
            }
            None => self.resolve_run(&plan.project, Some(&plan.root), Some(&plan.target), None)?,
        };
        if run.fingerprint != plan.fingerprint || run.target.id != plan.target {
            return Err(
                "The command or the files it runs changed after approval. Ask to run it again."
                    .into(),
            );
        }
        self.approve(&request.device, &run)?;
        Ok(RunOutcome::Started(
            self.launch_run(Some(&request.device), &run)?,
        ))
    }

    fn remember_plan(&self, run: &RunTarget) -> Result<String, String> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let token = bytes
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>();
        let mut plans = self.inner.plans.lock();
        plans.retain(|_, plan| plan.created.elapsed() < PLAN_TTL);
        if plans.len() >= MAX_PLANS {
            return Err("Too many runs are waiting for approval".into());
        }
        plans.insert(
            token.clone(),
            Plan {
                account: self.inner.grants.active_account()?,
                project: run.project_id.clone(),
                root: run.source_root.clone(),
                target: run.target.id.clone(),
                command: run.command.clone(),
                fingerprint: run.fingerprint.clone(),
                created: Instant::now(),
            },
        );
        Ok(token)
    }

    /// With nothing named, tell the agent what the project offers.
    fn offer(&self, project: &str, root: Option<&Path>) -> String {
        let folder = root
            .map(Path::to_path_buf)
            .or_else(|| self.inner.workspace.read().project_root(project));
        let custom = self
            .inner
            .grants
            .custom_commands(project, folder.as_deref().unwrap_or(Path::new("")));
        let offered = folder
            .as_deref()
            .and_then(Path::to_str)
            .and_then(|folder| vibyra_core::preview::inspect_project_with(folder, &custom).ok())
            .map(|inspection| {
                inspection
                    .targets
                    .into_iter()
                    .filter(|t| t.kind == vibyra_core::preview::PreviewTargetKind::Desktop)
                    .filter_map(|t| t.command.map(|command| format!("{} ({command})", t.id)))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if offered.is_empty() {
            "Name the command that starts the app, for example `npm run tauri:dev`.".into()
        } else {
            format!("Name one of this project's apps: {}", offered.join("; "))
        }
    }
}
