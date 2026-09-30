//! Desktop apps the phone can run, per open project, with whether running one
//! still needs the owner's approval and how its current run is going.

use super::PreviewService;
use crate::phone::preview_grants::runs::RunApprovalState;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use vibyra_core::preview::{inspect_project_with, DesktopStage, PreviewPhase, PreviewStatus};

const MAX_PROJECTS: usize = 24;
const CACHE: Duration = Duration::from_secs(3);
/// Bumped by an approval, so the next list shows it at once.
static EPOCH: AtomicU64 = AtomicU64::new(0);

/// The part of a row that needs manifests read: kept a few seconds, since the
/// phone asks often.
#[derive(Clone)]
struct Base {
    row: Value,
    root: PathBuf,
    target: String,
}
type Cached = (Vec<(String, PathBuf)>, u64, Instant, Vec<Base>);

pub(super) fn approvals_changed() {
    EPOCH.fetch_add(1, Ordering::SeqCst);
}

impl PreviewService {
    pub(super) fn runnable(&self, device: &str) -> Vec<Value> {
        let projects = self.inner.workspace.read().preview_projects();
        self.bases(&projects)
            .into_iter()
            .map(|base| self.with_run(device, base))
            .collect()
    }

    fn bases(&self, projects: &[(String, PathBuf)]) -> Vec<Base> {
        static CACHED: OnceLock<Mutex<Option<Cached>>> = OnceLock::new();
        let epoch = EPOCH.load(Ordering::SeqCst);
        let mut cached = CACHED.get_or_init(Default::default).lock();
        if let Some((seen, at_epoch, at, bases)) = cached.as_ref() {
            if seen == projects && *at_epoch == epoch && at.elapsed() < CACHE {
                return bases.clone();
            }
        }
        let mut bases = Vec::new();
        for (project, root) in projects.iter().take(MAX_PROJECTS) {
            let custom = self.inner.grants.custom_commands(project, root);
            let Some(inspection) = root
                .to_str()
                .and_then(|folder| inspect_project_with(folder, &custom).ok())
            else {
                continue;
            };
            for target in inspection.targets {
                if !target.runnable {
                    continue;
                }
                let Ok(run) = self.resolve_run(project, None, Some(&target.id), None) else {
                    continue;
                };
                let Ok(state) = self.run_approval(&run) else {
                    continue;
                };
                let mut row = run.approval(state);
                row["approvalRequired"] = json!(state != RunApprovalState::Approved);
                row["projectId"] = json!(project);
                row["framework"] = json!(run.target.framework);
                row["kind"] = json!(if run.target.kind
                    == vibyra_core::preview::PreviewTargetKind::Desktop
                {
                    "window"
                } else {
                    "web"
                });
                bases.push(Base {
                    row,
                    root: run.source_root,
                    target: run.target.id,
                });
            }
        }
        *cached = Some((projects.to_vec(), epoch, Instant::now(), bases.clone()));
        bases
    }

    /// Adds what changes second to second: the run and this device's window.
    fn with_run(&self, device: &str, base: Base) -> Value {
        let Base {
            mut row,
            root,
            target,
        } = base;
        if row["kind"] == "web" {
            self.refresh_run_site(&root, &target);
        }
        let runs = self.inner.runs.lock();
        let active = runs.get(&(root.clone(), target.clone()));
        let status = match active.and_then(|run| run.status.clone()) {
            Some(status) => Some(status),
            None => root
                .to_str()
                .and_then(|folder| self.inner.manager.status(folder, &target).ok())
                .filter(|status| status.phase != PreviewPhase::Idle),
        };
        row["runState"] = json!(status.as_ref().map_or("idle", run_state));
        if let Some(status) = &status {
            if cfg!(target_os = "linux")
                && status.stage == Some(DesktopStage::WaitingForWindow)
                && std::env::var_os("WAYLAND_DISPLAY").is_some()
            {
                // The app was asked to use X11; a toolkit that ignores that
                // opens a Wayland window no other app can capture.
                row["hint"] = json!("If the app opened a Wayland-only window, it cannot be shown. Apps Vibyra starts use X11 through XWayland when their toolkit supports it.");
            }
            row["stage"] = json!(status.stage);
            row["logTail"] = json!(log_tail(&status.logs));
            row["error"] = json!(status.error);
        }
        if let Some(active) = active {
            let owner = active.owners.iter().any(|owner| owner == device);
            let grant = active
                .windows
                .iter()
                .find(|((owner, _), _)| owner == device)
                .map(|(_, grant)| grant.clone());
            row["runId"] = json!(active.run_id);
            row["windowGrantId"] = json!(grant);
            row["autoOpen"] = json!(
                owner
                    && active.ended.is_none()
                    && grant.is_some()
                    && (row["kind"] != "web"
                        || status
                            .as_ref()
                            .is_some_and(|s| s.phase == PreviewPhase::Running))
            );
        }
        row
    }
}

pub(super) fn run_state(status: &PreviewStatus) -> &'static str {
    match (&status.phase, status.stage) {
        (PreviewPhase::Stopped, _) => "stopped",
        (_, Some(DesktopStage::TimedOut)) => "timed_out",
        (_, Some(DesktopStage::Exited)) => "exited",
        (PreviewPhase::Failed, _) => "failed",
        (PreviewPhase::Running, Some(DesktopStage::Ready)) => "ready",
        (_, Some(DesktopStage::WaitingForWindow)) => "waiting_for_window",
        (PreviewPhase::Starting, _) => "building",
        (PreviewPhase::Running, _) => "ready",
        (PreviewPhase::Idle, _) => "idle",
    }
}

/// The last few output lines, without the "[Tauri]" style prefixes.
pub(super) fn log_tail(logs: &[String]) -> Vec<String> {
    logs.iter()
        .rev()
        .take(3)
        .rev()
        .map(|line| {
            let line = match line
                .strip_prefix('[')
                .and_then(|rest| rest.split_once("] "))
            {
                Some((_, text)) => text,
                None => line,
            };
            line.chars().take(200).collect()
        })
        .collect()
}
