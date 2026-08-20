use std::net::{SocketAddr, TcpStream};
use std::time::{Duration, Instant};

use super::process::{push_log, snapshot_logs, terminate, LogBuffer, ManagedChild};
use super::static_server::StaticServer;
use super::types::{PreviewPhase, PreviewStatus};

const START_TIMEOUT: Duration = Duration::from_secs(75);

pub(crate) struct PreviewService {
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
}

impl PreviewService {
    pub fn refresh(&mut self) {
        if !matches!(self.phase, PreviewPhase::Starting | PreviewPhase::Running) {
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
        if self.phase == PreviewPhase::Starting && children.iter().all(port_ready) {
            push_log(&self.logs, "Preview is ready");
            self.phase = PreviewPhase::Running;
        } else if self.phase == PreviewPhase::Starting && self.started.elapsed() > START_TIMEOUT {
            let message = "Preview did not become ready within 75 seconds.";
            push_log(&self.logs, message);
            self.error = Some(message.into());
            self.phase = PreviewPhase::Failed;
            self.url.clear();
            terminate_all(children);
        }
    }

    pub fn stop(&mut self) {
        match &mut self.runtime {
            PreviewRuntime::Static(server) => server.stop(),
            PreviewRuntime::Processes(children) => terminate_all(children),
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
        PreviewStatus {
            phase: self.phase.clone(),
            target_id: self.target_id.clone(),
            url: (!self.url.is_empty()).then(|| self.url.clone()),
            command: Some(self.command.clone()),
            logs: snapshot_logs(&self.logs),
            error: self.error.clone(),
        }
    }
}

fn port_ready(child: &ManagedChild) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], child.port));
    TcpStream::connect_timeout(&address, Duration::from_millis(80)).is_ok()
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
            child,
            port: 1,
        };
        let mut service = PreviewService {
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
