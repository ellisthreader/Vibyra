//! Follows each run Vibyra started: as its windows appear the devices that
//! asked may view them, and when it ends those grants go with it.

use super::run_control::{ActiveRun, RunTarget};
use super::{Inner, PreviewService};
use serde_json::{json, Value};
use std::path::Path;
use std::sync::{Arc, Weak};
use std::time::{Duration, Instant};
use vibyra_core::preview::{PreviewEvent, PreviewPhase};

/// How long an ended run stays listed, so the phone can show why it ended.
const TOMBSTONE: Duration = Duration::from_secs(60);

impl PreviewService {
    pub(super) fn listen_for_runs(inner: &Arc<Inner>) {
        let weak: Weak<Inner> = Arc::downgrade(inner);
        inner.manager.set_listener(Arc::new(move |event| {
            if let Some(inner) = weak.upgrade() {
                PreviewService { inner }.on_run_event(event);
            }
        }));
    }

    /// Starts (or joins) the run. `owner` is the device that will view it.
    pub(super) fn launch_run(&self, owner: Option<&str>, run: &RunTarget) -> Result<Value, String> {
        let account = self.inner.grants.active_account()?;
        let folder = run.source_root.to_str().ok_or("Invalid project folder")?;
        let key = (run.source_root.clone(), run.target.id.clone());
        let owner = owner
            .filter(|device| *device != "desktop")
            .map(str::to_owned);
        {
            let mut runs = self.inner.runs.lock();
            runs.retain(|_, run| run.ended.is_none_or(|at| at.elapsed() < TOMBSTONE));
            let live = runs
                .get(&key)
                .is_some_and(|run| run.ended.is_none() && run.account == account);
            if !live {
                runs.insert(
                    key.clone(),
                    ActiveRun {
                        run_id: random_id()?,
                        runtime_id: None,
                        owners: Vec::new(),
                        account,
                        project_id: run.project_id.clone(),
                        name: run.target.name.clone(),
                        windows: Default::default(),
                        status: None,
                        ended: None,
                    },
                );
            }
            let active = runs.get_mut(&key).ok_or("Run was replaced")?;
            if let Some(owner) = &owner {
                if !active.owners.contains(owner) {
                    active.owners.push(owner.clone());
                }
            }
        }
        let started = self
            .inner
            .manager
            .start_with(folder, &run.target.id, &run.custom);
        let (status, runtime_id) = match started.and_then(|_| {
            self.inner
                .manager
                .status_with_runtime(folder, &run.target.id)
        }) {
            Ok(found) => found,
            Err(error) => {
                self.inner.runs.lock().remove(&key);
                return Err(error.to_string());
            }
        };
        let runtime_id = runtime_id.ok_or("The app did not start")?;
        // Already running (or already showing a window): catch up at once.
        self.on_run_event(PreviewEvent {
            root: folder.to_owned(),
            target_id: run.target.id.clone(),
            runtime_id,
            status,
        });
        self.share_run_site(owner.as_deref(), run)?;
        self.run_summary(&key.0, &key.1)
            .ok_or_else(|| "The app stopped".into())
    }

    pub(super) fn on_run_event(&self, event: PreviewEvent) {
        let ended = matches!(
            event.status.phase,
            PreviewPhase::Failed | PreviewPhase::Stopped
        );
        let mut wanted = Vec::new();
        let mut revoke = None;
        {
            let mut runs = self.inner.runs.lock();
            let found = runs.iter_mut().find(|((root, target), run)| {
                *target == event.target_id
                    && same_path(root, Path::new(&event.root))
                    && run.ended.is_none()
                    && run.runtime_id.is_none_or(|id| id == event.runtime_id)
            });
            if let Some(((root, _), run)) = found {
                run.runtime_id = Some(event.runtime_id);
                if ended {
                    run.ended = Some(Instant::now());
                    revoke = Some(run.run_id.clone());
                } else {
                    for owner in &run.owners {
                        for window in &event.status.windows {
                            let target =
                                format!("native-window:{}:{}:control", window.pid, window.id);
                            if !run.windows.contains_key(&(owner.clone(), target.clone())) {
                                wanted.push((
                                    owner.clone(),
                                    target,
                                    window.fingerprint.clone(),
                                    root.clone(),
                                    run.clone_ids(),
                                ));
                            }
                        }
                    }
                }
                run.status = Some(event.status.clone());
            }
        }
        for (owner, target, fingerprint, root, (run_id, project, account)) in wanted {
            if self.inner.grants.active_account().ok().as_deref() != Some(account.as_str()) {
                continue;
            }
            let granted = self.inner.grants.grant_run_window(
                &owner,
                &project,
                &root,
                &target,
                &fingerprint,
                &run_id,
            );
            if let Ok(grant) = granted {
                let mut runs = self.inner.runs.lock();
                if let Some(run) = runs.values_mut().find(|run| run.run_id == run_id) {
                    run.windows.insert((owner, target), grant);
                }
            }
        }
        if let Some(run_id) = revoke {
            let _ = self.inner.grants.revoke_run(&run_id);
        }
        super::watch::changed();
    }

    /// The phone's view of one run: its state, last lines and window grant.
    pub(super) fn run_summary(&self, root: &Path, target_id: &str) -> Option<Value> {
        let runs = self.inner.runs.lock();
        let run = runs.get(&(root.to_owned(), target_id.to_owned()))?;
        let status = run.status.as_ref()?;
        Some(
            json!({"runId":run.run_id,"targetId":target_id,"name":run.name,
            "runState":super::run_list::run_state(status),"stage":status.stage,
            "logTail":super::run_list::log_tail(&status.logs),"error":status.error}),
        )
    }
}

impl ActiveRun {
    fn clone_ids(&self) -> (String, String, String) {
        (
            self.run_id.clone(),
            self.project_id.clone(),
            self.account.clone(),
        )
    }
}

fn same_path(left: &Path, right: &Path) -> bool {
    left.components().eq(right.components())
        || left
            .canonicalize()
            .ok()
            .zip(right.canonicalize().ok())
            .is_some_and(|(a, b)| a == b)
}

fn random_id() -> Result<String, String> {
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
