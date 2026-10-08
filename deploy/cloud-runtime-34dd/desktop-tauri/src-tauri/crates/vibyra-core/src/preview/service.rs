use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

use super::desktop_run::DesktopRun;
use super::diagnose::diagnose;
use super::process::{log_idle, push_log, snapshot_logs, terminate, LogBuffer, ManagedChild};
use super::service_install::Installing;
use super::static_server::StaticServer;
use super::types::{PreviewPhase, PreviewStatus, PreviewStep};

/// A server that prints nothing for this long, and has not opened its port, is stuck.
/// One that keeps printing (a cold Next or Expo build) is given until the cap.
const START_IDLE: Duration = Duration::from_secs(90);
const START_CAP: Duration = Duration::from_secs(6 * 60);

pub(crate) struct PreviewService {
    /// Assigned by PreviewManager when this launch becomes its managed runtime.
    pub runtime_id: u64,
    pub target_id: String,
    pub phase: PreviewPhase,
    pub url: String,
    pub command: String,
    pub error: Option<String>,
    pub logs: LogBuffer,
    pub started: Instant,
    pub runtime: PreviewRuntime,
}

pub(crate) enum PreviewRuntime {
    Static(StaticServer),
    Processes(Vec<ManagedChild>),
    /// Installing dependencies; the servers start once it finishes.
    Installing(Box<Installing>),
    Desktop(DesktopRun),
}

impl PreviewService {
    pub fn refresh(&mut self) {
        if !matches!(self.phase, PreviewPhase::Starting | PreviewPhase::Running) {
            return;
        }
        self.refresh_desktop_exit();
        if matches!(self.runtime, PreviewRuntime::Installing(_)) {
            self.advance_install();
            return;
        }
        let PreviewRuntime::Processes(children) = &mut self.runtime else {
            return;
        };
        for child in children.iter_mut() {
            if let Ok(Some(exit)) = child.child.try_wait() {
                let message = format!("{} exited with {}", child.label, exit);
                push_log(&self.logs, &message);
                self.error = Some(message);
                self.phase = PreviewPhase::Failed;
                self.url.clear();
                terminate_all(children);
                return;
            }
        }
        if self.phase != PreviewPhase::Starting {
            return;
        }
        let hosts = children.iter().map(port_host).collect::<Vec<_>>();
        if hosts.iter().all(Option::is_some) {
            // A server bound only to ::1 is reachable there, not on 127.0.0.1.
            for (child, host) in children.iter().zip(&hosts) {
                if *host == Some("[::1]") && self.url.contains(&format!(":{}/", child.port)) {
                    self.url = format!("http://[::1]:{}/", child.port);
                }
            }
            push_log(&self.logs, "Preview is ready");
            self.phase = PreviewPhase::Running;
        } else {
            let idle = log_idle(&self.logs).map_or(self.started.elapsed(), |idle| {
                idle.min(self.started.elapsed())
            });
            if idle > START_IDLE || self.started.elapsed() > START_CAP {
                let message = format!("Preview did not become ready: nothing opened its port and it printed no output for {} seconds.", idle.as_secs());
                terminate_all(children);
                self.fail(message);
            }
        }
    }

    pub fn stop(&mut self) {
        match &mut self.runtime {
            PreviewRuntime::Static(server) => server.stop(),
            PreviewRuntime::Processes(children) => terminate_all(children),
            PreviewRuntime::Installing(state) => terminate(&mut state.current),
            PreviewRuntime::Desktop(run) => run.stop(),
        }
    }

    pub fn stopped_status(&mut self) -> PreviewStatus {
        self.stop();
        push_log(&self.logs, "Preview stopped");
        self.phase = PreviewPhase::Stopped;
        self.url.clear();
        self.status()
    }

    pub fn status(&self) -> PreviewStatus {
        let (stage, windows) = match &self.runtime {
            PreviewRuntime::Desktop(run) => (Some(run.stage), run.windows.clone()),
            _ => (None, Vec::new()),
        };
        let logs = snapshot_logs(&self.logs);
        let diagnosis = (self.phase == PreviewPhase::Failed)
            .then(|| diagnose(self.error.as_deref().unwrap_or(""), &logs));
        let step = (self.phase == PreviewPhase::Starting).then(|| match &self.runtime {
            PreviewRuntime::Installing(_) => Some(PreviewStep::Installing),
            PreviewRuntime::Processes(_) if logs.iter().any(|line| line.starts_with('[')) => {
                Some(PreviewStep::Waiting)
            }
            PreviewRuntime::Processes(_) => Some(PreviewStep::Starting),
            _ => None,
        });
        PreviewStatus {
            phase: self.phase.clone(),
            target_id: self.target_id.clone(),
            url: (!self.url.is_empty()).then(|| self.url.clone()),
            command: Some(self.command.clone()),
            logs,
            error: self.error.clone(),
            stage,
            windows,
            step: step.flatten(),
            error_code: diagnosis.as_ref().map(|found| found.code),
            summary: diagnosis.as_ref().map(|found| found.summary.clone()),
            cause: diagnosis.as_ref().and_then(|found| found.cause.clone()),
            hint: diagnosis.map(|found| found.hint),
        }
    }
}

/// The loopback address the server answers on, IPv4 first.
fn port_host(child: &ManagedChild) -> Option<&'static str> {
    let probe = |address: SocketAddr| {
        TcpStream::connect_timeout(&address, Duration::from_millis(80)).is_ok()
    };
    if probe(SocketAddr::from(([127, 0, 0, 1], child.port))) {
        Some("127.0.0.1")
    } else if probe(SocketAddr::from(([0, 0, 0, 0, 0, 0, 0, 1], child.port))) {
        Some("[::1]")
    } else {
        None
    }
}

fn terminate_all(children: &mut [ManagedChild]) {
    for child in children {
        terminate(child);
    }
}

#[cfg(test)]
mod tests {
    use std::process::{Command, Stdio};

    use super::*;
    use crate::preview::process::new_logs;

    #[test]
    fn failed_process_status_never_exposes_a_stale_url() {
        let mut child = Command::new(std::env::current_exe().unwrap())
            .arg("--list")
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        child.wait().unwrap();
        let managed = ManagedChild {
            label: "test server".into(),
            tree: crate::preview::process::TreeGuard::adopt(&child),
            child,
            port: 1,
        };
        let mut service = PreviewService {
            runtime_id: 0,
            target_id: "test".into(),
            phase: PreviewPhase::Starting,
            url: "http://127.0.0.1:1/".into(),
            command: "test".into(),
            error: None,
            logs: new_logs(),
            started: Instant::now(),
            runtime: PreviewRuntime::Processes(vec![managed]),
        };

        service.refresh();

        assert_eq!(service.phase, PreviewPhase::Failed);
        assert!(service.status().url.is_none());
    }
}
