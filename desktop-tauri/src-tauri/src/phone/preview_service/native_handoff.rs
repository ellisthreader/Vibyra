use super::{
    native_discovery::{self, OwnedWindow},
    PreviewService,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    time::{Duration, Instant},
};

#[derive(Clone)]
pub(super) struct Candidate {
    account: String,
    window: OwnedWindow,
    seen: Instant,
}
#[derive(Default)]
pub(super) struct Handoff {
    pub(super) candidates: HashMap<(String, String), Candidate>,
}

impl PreviewService {
    pub(super) fn list_handoff(&self, device: &str) -> Value {
        let mut result = self.list_kinds(device, true);
        result["runnable"] = json!(self.runnable(device));
        result["previewRunV1"] = json!(true);
        // "macos", "windows" or "linux": the phone names the computer by it.
        result["hostPlatform"] = json!(std::env::consts::OS);
        let projects = self.inner.workspace.read().preview_projects();
        let windows = self.inner.grants.active_account().and_then(|account| {
            native_discovery::cached(&projects).map(|windows| (account, windows))
        });
        result["windowHandoffV1"] = json!(true);
        let (account, windows) = match windows {
            Ok(found) => found,
            Err(error) => {
                self.inner
                    .handoff
                    .lock()
                    .candidates
                    .retain(|(owner, _), _| owner != device);
                result["windowProblem"] = json!(error);
                return result;
            }
        };
        if self.inner.grants.active_account().ok().as_ref() != Some(&account) {
            result["windowProblem"] = json!("Preview account changed. Refresh Preview.");
            return result;
        }
        let targets = result["targets"].as_array_mut().unwrap();
        let mut state = self.inner.handoff.lock();
        state
            .candidates
            .retain(|_, candidate| candidate.seen.elapsed() < Duration::from_secs(60));
        for window in windows {
            if targets.iter().any(|t| {
                t["projectId"] == window.project
                    && t["running"] == true
                    && crate::window_preview::Target::parse(t["targetId"].as_str().unwrap_or(""))
                        .ok()
                        .flatten()
                        .is_some_and(|t| t.id == window.info.id && t.pid == window.info.pid)
            }) {
                continue;
            }
            let existing = state
                .candidates
                .iter()
                .find(|((owner, _), old)| {
                    owner == device && old.account == account && old.window.same(&window)
                })
                .map(|((_, id), _)| id.clone());
            let token = match existing {
                Some(id) => id,
                None => {
                    if state.candidates.len() >= 256 {
                        break;
                    }
                    let mut bytes = [0u8; 16];
                    if getrandom::fill(&mut bytes).is_err() {
                        break;
                    }
                    bytes.iter().map(|b| format!("{b:02x}")).collect()
                }
            };
            targets.push(json!({"grantId":token,"projectId":window.project,"targetId":window.target(),
                "name":format!("{} · {}",window.info.name,window.info.title),"kind":"window",
                "running":true,"approvalRequired":true,"worktree":window.root != window.project_root}));
            state.candidates.insert(
                (device.into(), token),
                Candidate {
                    account: account.clone(),
                    window,
                    seen: Instant::now(),
                },
            );
        }
        result
    }

    /// Only a user pressing the phone's explicit View button calls this RPC.
    /// The agent status tool cannot call it, and it never grants input control.
    pub(super) fn share_window(&self, device: &str, token: &str) -> Result<Value, String> {
        super::control_access::permission("screen:view")?;
        let candidate = self
            .inner
            .handoff
            .lock()
            .candidates
            .get(&(device.into(), token.into()))
            .filter(|c| c.seen.elapsed() < Duration::from_secs(60))
            .cloned()
            .ok_or("This window selection expired. Refresh Preview and select it again.")?;
        if self.inner.grants.active_account()? != candidate.account {
            return Err("Preview account changed".into());
        }
        let workspace = self.inner.workspace.read();
        let root = workspace
            .project_root(&candidate.window.project)
            .ok_or("Project is no longer open")?;
        if root.canonicalize().ok().as_ref() != Some(&candidate.window.project_root) {
            return Err("Project folder changed".into());
        }
        let found = native_discovery::scan(&workspace.preview_projects())?
            .into_iter()
            .find(|w| w.same(&candidate.window))
            .ok_or("The application window changed or closed. Refresh Preview.")?;
        let target = found.control_target();
        self.inner.grants.grant_window(
            device,
            &found.project,
            &found.root,
            &target,
            &candidate.account,
            &found.info.fingerprint,
        )?;
        super::control_access::permission("screen:view")?;
        let grant = self
            .inner
            .grants
            .list_for_device(device)
            .into_iter()
            .find(|g| {
                g.project_id == found.project
                    && g.source_root == found.root
                    && g.target_id == target
            })
            .ok_or("Window approval was revoked")?;
        self.inner
            .grants
            .authorize_id(device, &grant.id, &workspace)?;
        self.inner
            .handoff
            .lock()
            .candidates
            .remove(&(device.into(), token.into()));
        super::watch::changed();
        Ok(
            json!({"grantId":grant.id,"projectId":found.project,"targetId":target,
            "name":format!("{} · {}",found.info.name,found.info.title),"running":true,"kind":"window"}),
        )
    }
}

#[cfg(test)]
#[path = "native_handoff_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "native_handoff_live.rs"]
mod live;
