//! A desktop app Preview started: building, waiting for its window, showing
//! it, or gone. Only the refresher probes windows; status reads stay cheap.

use std::sync::Arc;
use std::time::{Duration, Instant};

use super::process::{log_total, push_log, terminate, ManagedChild};
use super::process_kill::kill_pid_verified;
use super::refresher::{DesktopProbe, ProbeSnapshot, TreeProcess};
use super::service::{PreviewRuntime, PreviewService};
use super::types::{DesktopStage, PreviewPhase, PreviewWindow};

/// A first Rust or Electron build can take many minutes, more in a VM.
pub(crate) const MAX_WITHOUT_WINDOW: Duration = Duration::from_secs(30 * 60);
/// No output and no new process for this long means the build is stuck.
pub(crate) const STALL: Duration = Duration::from_secs(10 * 60);
const MAX_WINDOWS: usize = 8;

/// Processes that build or launch an app rather than being it. Seeing
/// something else in the tree means the app itself has started.
const TOOLS: [&str; 24] = [
    "npm",
    "npx",
    "node",
    "pnpm",
    "yarn",
    "bun",
    "bunx",
    "sh",
    "bash",
    "zsh",
    "dash",
    "cmd",
    "conhost",
    "powershell",
    "cargo",
    "rustc",
    "rustup",
    "cc",
    "clang",
    "ld",
    "ld64",
    "link",
    "esbuild",
    "tsc",
];

pub(crate) struct DesktopRun {
    pub child: ManagedChild,
    pub probe: Option<Arc<dyn DesktopProbe>>,
    pub stage: DesktopStage,
    pub windows: Vec<PreviewWindow>,
    pub tree: Vec<TreeProcess>,
    seen_output: u64,
    pub(crate) progress_at: Instant,
}

impl DesktopRun {
    pub(crate) fn new(child: ManagedChild, probe: Option<Arc<dyn DesktopProbe>>) -> Self {
        Self {
            child,
            probe,
            stage: DesktopStage::Building,
            windows: Vec::new(),
            tree: Vec::new(),
            seen_output: 0,
            progress_at: Instant::now(),
        }
    }

    /// Ends the tree, including anything that left its process group, but
    /// only processes whose start time proves they are the ones it started.
    pub(crate) fn stop(&mut self) {
        terminate(&mut self.child);
        if let Some(probe) = &self.probe {
            for process in &self.tree {
                kill_pid_verified(probe.as_ref(), process);
            }
        }
        self.windows.clear();
    }
}

impl PreviewService {
    /// Cheap check on every status read: has the app exited?
    pub(crate) fn refresh_desktop_exit(&mut self) {
        let PreviewRuntime::Desktop(run) = &mut self.runtime else {
            return;
        };
        if let Ok(Some(exit)) = run.child.child.try_wait() {
            let message = format!("The app exited ({exit}).");
            push_log(&self.logs, &message);
            run.stop();
            run.stage = DesktopStage::Exited;
            self.error = Some(message);
            self.phase = PreviewPhase::Failed;
        }
    }

    /// Called by the refresher with one shared snapshot.
    pub(crate) fn refresh_desktop(&mut self, probe: &dyn DesktopProbe, snapshot: &ProbeSnapshot) {
        self.refresh_desktop_exit();
        if !matches!(self.phase, PreviewPhase::Starting | PreviewPhase::Running) {
            return;
        }
        let total = log_total(&self.logs);
        let PreviewRuntime::Desktop(run) = &mut self.runtime else {
            return;
        };
        let tree = probe.tree(snapshot, run.child.child.id());
        let mut windows = probe.windows(snapshot, &tree);
        windows.sort();
        windows.truncate(MAX_WINDOWS);
        if total != run.seen_output || tree != run.tree {
            run.progress_at = Instant::now();
            run.seen_output = total;
        }
        let app_started = tree.iter().any(|process| !is_tool(&process.name));
        run.tree = tree;
        run.windows = windows;
        if !run.windows.is_empty() {
            if run.stage != DesktopStage::Ready {
                push_log(&self.logs, "The app's window is open");
            }
            run.stage = DesktopStage::Ready;
            self.phase = PreviewPhase::Running;
            return;
        }
        if self.phase == PreviewPhase::Running {
            // Every window closed but the app is alive (a tray app, say).
            run.stage = DesktopStage::WaitingForWindow;
            return;
        }
        if app_started {
            run.stage = DesktopStage::WaitingForWindow;
        }
        let timeout = if self.started.elapsed() > MAX_WITHOUT_WINDOW {
            Some("The app did not open a window within 30 minutes.")
        } else if run.progress_at.elapsed() > STALL {
            Some("The build printed nothing and started nothing for 10 minutes.")
        } else {
            None
        };
        if let Some(message) = timeout {
            push_log(&self.logs, message);
            run.stop();
            run.stage = DesktopStage::TimedOut;
            self.error = Some(message.into());
            self.phase = PreviewPhase::Failed;
        }
    }

    pub(crate) fn is_live_desktop(&self) -> bool {
        matches!(self.runtime, PreviewRuntime::Desktop(_))
            && matches!(self.phase, PreviewPhase::Starting | PreviewPhase::Running)
    }
}

fn is_tool(name: &str) -> bool {
    let name = name.to_ascii_lowercase();
    let name = name.strip_suffix(".exe").unwrap_or(&name);
    TOOLS.contains(&name) || name.starts_with("build-script-") || name.starts_with("node-")
}
