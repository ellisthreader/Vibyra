//! The install a run performs before its servers, one command after another.

use std::time::{Duration, Instant};

use super::launch_processes::start_processes;
use super::process::{push_log, spawn_process, terminate, ManagedChild};
use super::service::{PreviewRuntime, PreviewService};
use super::types::{PreviewPhase, ProcessSpec};

/// A cold install of a large monorepo can take minutes; this only stops one that never ends.
const INSTALL_CAP: Duration = Duration::from_secs(15 * 60);

pub(crate) struct Installing {
    pub current: ManagedChild,
    pub queued: Vec<ProcessSpec>,
    pub then: Vec<ProcessSpec>,
    pub primary_index: usize,
}

impl PreviewService {
    /// Moves a run that is installing forward: next install step, or its servers.
    pub(super) fn advance_install(&mut self) {
        let logs = self.logs.clone();
        let PreviewRuntime::Installing(state) = &mut self.runtime else {
            return;
        };
        match state.current.child.try_wait() {
            Ok(None) => {
                if self.started.elapsed() > INSTALL_CAP {
                    let message = "Installing dependencies did not finish within 15 minutes.";
                    terminate(&mut state.current);
                    self.fail(message);
                }
                return;
            }
            Ok(Some(exit)) if exit.success() => {}
            Ok(Some(exit)) => {
                let message = format!(
                    "Installing dependencies failed ({} exited with {exit})",
                    state.current.label
                );
                self.fail(message);
                return;
            }
            Err(error) => {
                let message = format!("Installing dependencies failed: {error}");
                self.fail(message);
                return;
            }
        }
        if !state.queued.is_empty() {
            let next = state.queued.remove(0);
            match spawn_process(&next, 0, &logs) {
                Ok((child, _)) => state.current = child,
                Err(error) => self.fail(format!("Installing dependencies failed: {error}")),
            }
            return;
        }
        push_log(&logs, "Dependencies installed");
        let then = std::mem::take(&mut state.then);
        match start_processes(&then, state.primary_index, &logs) {
            Ok((children, url, _)) => {
                self.runtime = PreviewRuntime::Processes(children);
                self.url = url;
                self.started = Instant::now();
            }
            Err(error) => self.fail(error.to_string()),
        }
    }

    pub(super) fn fail(&mut self, message: impl Into<String>) {
        let message = message.into();
        push_log(&self.logs, &message);
        self.error = Some(message);
        self.phase = PreviewPhase::Failed;
        self.url.clear();
    }
}
