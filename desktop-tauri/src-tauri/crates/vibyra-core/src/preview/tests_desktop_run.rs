#![cfg(unix)]

use std::process::{Command, Stdio};
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use super::desktop_run::{DesktopRun, MAX_WITHOUT_WINDOW, STALL};
use super::process::{new_logs, ManagedChild, TreeGuard};
use super::refresher::{DesktopProbe, ProbeSnapshot, TreeProcess};
use super::service::{PreviewRuntime, PreviewService};
use super::types::{DesktopStage, PreviewPhase, PreviewWindow};

/// Reports whatever the test scripts: extra processes in the tree and windows.
#[derive(Default)]
struct FakeProbe {
    names: Mutex<Vec<String>>,
    windows: Mutex<Vec<PreviewWindow>>,
    killed_ok: Mutex<Vec<u32>>,
}

impl DesktopProbe for FakeProbe {
    fn snapshot(&self) -> ProbeSnapshot {
        ProbeSnapshot(Box::new(()))
    }
    fn tree(&self, _: &ProbeSnapshot, root: u32) -> Vec<TreeProcess> {
        let mut tree = vec![TreeProcess {
            pid: root,
            start: 1,
            name: "npm".into(),
        }];
        tree.extend(
            self.names
                .lock()
                .iter()
                .enumerate()
                .map(|(index, name)| TreeProcess {
                    pid: 900_000 + index as u32,
                    start: 2,
                    name: name.clone(),
                }),
        );
        tree
    }
    fn windows(&self, _: &ProbeSnapshot, _: &[TreeProcess]) -> Vec<PreviewWindow> {
        self.windows.lock().clone()
    }
    fn still_running(&self, process: &TreeProcess) -> bool {
        self.killed_ok.lock().push(process.pid);
        false
    }
}

fn service(probe: &Arc<FakeProbe>) -> PreviewService {
    let mut command = Command::new("sh");
    command.args(["-c", "sleep 30"]).stdin(Stdio::null());
    crate::process_group::isolate(&mut command);
    let child = command.spawn().unwrap();
    let managed = ManagedChild {
        label: "app".into(),
        tree: TreeGuard::adopt(&child),
        child,
        port: 0,
    };
    let probe: Arc<dyn DesktopProbe> = probe.clone();
    PreviewService {
        runtime_id: 1,
        target_id: ".::desktop-app".into(),
        phase: PreviewPhase::Starting,
        url: String::new(),
        command: "npm run app".into(),
        error: None,
        logs: new_logs(),
        started: Instant::now(),
        runtime: PreviewRuntime::Desktop(DesktopRun::new(managed, Some(probe))),
    }
}

fn tick(service: &mut PreviewService, probe: &FakeProbe) {
    service.refresh_desktop(probe, &probe.snapshot());
}

#[test]
fn a_run_builds_then_waits_then_shows_its_window() {
    let probe = Arc::new(FakeProbe::default());
    let mut service = service(&probe);
    tick(&mut service, &probe);
    assert_eq!(service.status().stage, Some(DesktopStage::Building));

    probe.names.lock().extend(["cargo".into(), "rustc".into()]);
    tick(&mut service, &probe);
    assert_eq!(service.status().stage, Some(DesktopStage::Building));

    probe.names.lock().push("hke-desktop".into());
    tick(&mut service, &probe);
    assert_eq!(service.status().stage, Some(DesktopStage::WaitingForWindow));
    assert_eq!(service.phase, PreviewPhase::Starting);

    let window = PreviewWindow {
        pid: 900_002,
        id: 7,
        fingerprint: "f".into(),
    };
    probe.windows.lock().push(window.clone());
    tick(&mut service, &probe);
    let status = service.status();
    assert_eq!(status.phase, PreviewPhase::Running);
    assert_eq!(status.stage, Some(DesktopStage::Ready));
    assert_eq!(status.windows, vec![window]);
    assert!(status.url.is_none());

    service.stop();
    // Tree members outside the group are only killed after a start-time check.
    assert!(probe.killed_ok.lock().contains(&900_002));
}

#[test]
fn an_app_that_exits_fails_the_run() {
    let probe = Arc::new(FakeProbe::default());
    let mut service = service(&probe);
    if let PreviewRuntime::Desktop(run) = &mut service.runtime {
        run.child.child.kill().unwrap();
        run.child.child.wait().unwrap();
    }
    tick(&mut service, &probe);
    assert_eq!(service.phase, PreviewPhase::Failed);
    assert_eq!(service.status().stage, Some(DesktopStage::Exited));
}

#[test]
fn a_run_with_no_window_or_no_progress_times_out() {
    let probe = Arc::new(FakeProbe::default());
    let Some(long_ago) = Instant::now().checked_sub(MAX_WITHOUT_WINDOW + Duration::from_secs(1))
    else {
        return;
    };
    let mut service = service(&probe);
    service.started = long_ago;
    tick(&mut service, &probe);
    assert_eq!(service.status().stage, Some(DesktopStage::TimedOut));
    assert!(service.error.as_deref().unwrap().contains("30 minutes"));

    let mut stalled = service_with_stall(&probe);
    tick(&mut stalled, &probe);
    assert_eq!(stalled.status().stage, Some(DesktopStage::TimedOut));
}

fn service_with_stall(probe: &Arc<FakeProbe>) -> PreviewService {
    let mut service = service(probe);
    tick(&mut service, probe);
    if let (PreviewRuntime::Desktop(run), Some(then)) = (
        &mut service.runtime,
        Instant::now().checked_sub(STALL + Duration::from_secs(1)),
    ) {
        run.progress_at = then;
    }
    service
}

#[test]
fn the_manager_reports_each_change_once_and_every_stop() {
    let manager = super::PreviewManager::new();
    let probe = Arc::new(FakeProbe::default());
    manager.set_desktop_probe(probe.clone());
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&events);
    manager.set_listener(Arc::new(move |event: super::PreviewEvent| {
        sink.lock().push((event.root, event.status.phase));
    }));
    let service = Arc::new(Mutex::new(service(&probe)));
    manager
        .services
        .lock()
        .insert("/p\0.::desktop-app".into(), service);
    assert!(manager.tick());
    assert!(manager.tick());
    assert!(events.lock().is_empty(), "nothing changed yet");

    probe.windows.lock().push(PreviewWindow {
        pid: 1,
        id: 2,
        fingerprint: "f".into(),
    });
    assert!(manager.tick());
    assert!(manager.tick());
    assert_eq!(
        *events.lock(),
        vec![("/p".to_owned(), PreviewPhase::Running)]
    );

    manager.stop("/p", ".::desktop-app").unwrap();
    assert_eq!(events.lock().last().unwrap().1, PreviewPhase::Stopped);
    assert!(!manager.tick(), "no live run is left for the thread");
}
