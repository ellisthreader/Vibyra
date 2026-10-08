//! Owner approvals for running a project's desktop app outside the agent
//! sandbox. One approval covers one command in one project for the signed-in
//! account, whichever of the account's phones or agents asks next, until the
//! command or the files it runs change.

use super::identity::{absolute_root, validate_id};
use super::runs_store::{self, MAX_RUNS};
use super::PreviewGrants;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use vibyra_core::preview::DesktopCommand;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunApproval {
    pub account_id: String,
    pub project_id: String,
    pub source_root: PathBuf,
    pub canonical_root: PathBuf,
    pub target_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<DesktopCommand>,
    pub fingerprint: String,
    pub approved_by_device: String,
    pub approved_ms: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum RunApprovalState {
    Approved,
    /// Approved once, but the command or its files changed since.
    Changed,
    Missing,
}

impl PreviewGrants {
    pub(crate) fn run_state(
        &self,
        project_id: &str,
        root: &Path,
        target_id: &str,
        fingerprint: &str,
    ) -> Result<RunApprovalState, String> {
        let account = self.active_account()?;
        let source_root = absolute_root(root)?;
        let runs = self.runs.lock();
        let found = runs.iter().find(|run| {
            run.account_id == account
                && run.project_id == project_id
                && run.source_root == source_root
                && run.target_id == target_id
        });
        Ok(match found {
            Some(run) if run.fingerprint == fingerprint => RunApprovalState::Approved,
            Some(_) => RunApprovalState::Changed,
            None => RunApprovalState::Missing,
        })
    }

    /// Records the owner's tap. `fingerprint` is the one they were shown.
    pub(crate) fn approve_run(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
        command: Option<DesktopCommand>,
        fingerprint: &str,
    ) -> Result<(), String> {
        let account_id = self.active_account()?;
        validate_id(device_id)?;
        validate_id(project_id)?;
        let source_root = absolute_root(root)?;
        let canonical_root = source_root.canonicalize().map_err(|e| e.to_string())?;
        let approved_ms = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_or(0, |time| time.as_millis() as u64);
        let approval = RunApproval {
            account_id,
            project_id: project_id.into(),
            source_root,
            canonical_root,
            target_id: target_id.into(),
            command,
            fingerprint: fingerprint.into(),
            approved_by_device: device_id.into(),
            approved_ms,
        };
        let mut runs = self.runs.lock();
        let mut next = runs
            .iter()
            .filter(|run| {
                !(run.account_id == approval.account_id
                    && run.project_id == approval.project_id
                    && run.source_root == approval.source_root
                    && run.target_id == approval.target_id)
            })
            .cloned()
            .collect::<Vec<_>>();
        next.push(approval);
        if next.len() > MAX_RUNS {
            next.sort_by_key(|run| std::cmp::Reverse(run.approved_ms));
            next.truncate(MAX_RUNS);
        }
        self.save_runs(&mut runs, next)
    }

    /// Commands approved for this project that detection does not offer.
    pub(crate) fn custom_commands(&self, project_id: &str, root: &Path) -> Vec<DesktopCommand> {
        let (Ok(account), Ok(source_root)) = (self.active_account(), absolute_root(root)) else {
            return Vec::new();
        };
        self.runs
            .lock()
            .iter()
            .filter(|run| {
                run.account_id == account
                    && run.project_id == project_id
                    && run.source_root == source_root
            })
            .filter_map(|run| run.command.clone())
            .collect()
    }

    /// Keeps only this account's approvals when the Mac's account changes.
    pub(super) fn keep_runs_for(&self, account_id: Option<&str>) -> Result<(), String> {
        let mut runs = self.runs.lock();
        let next = runs
            .iter()
            .filter(|run| Some(run.account_id.as_str()) == account_id)
            .cloned()
            .collect::<Vec<_>>();
        if next.len() == runs.len() {
            return Ok(());
        }
        self.save_runs(&mut runs, next)
    }

    fn save_runs(&self, runs: &mut Vec<RunApproval>, next: Vec<RunApproval>) -> Result<(), String> {
        if let Err(error) = runs_store::save(&self.state_dir, &next) {
            self.disabled.store(true, Ordering::SeqCst);
            runs.clear();
            return Err(format!("Preview sharing disabled: {error}"));
        }
        *runs = next;
        Ok(())
    }
}
