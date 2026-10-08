//! The install-then-serve runtime, against real processes.

use std::os::unix::process::CommandExt;
use std::process::Command;
use std::time::{Duration, Instant};

use crate::preview::process::{new_logs, spawn_process, ManagedChild};
use crate::preview::service::{PreviewRuntime, PreviewService};
use crate::preview::service_install::Installing;
use crate::preview::types::{PreviewErrorCode, PreviewPhase, PreviewStep, ProcessSpec};

fn sh(script: &str) -> ProcessSpec {
    ProcessSpec {
        label: "Install".into(),
        program: "sh".into(),
        args: vec!["-c".into(), script.into()],
        env: Vec::new(),
        cwd: std::env::temp_dir(),
    }
}

fn installing(install: &str, then: &str) -> PreviewService {
    let logs = new_logs();
    let (current, _) = spawn_process(&sh(install), 0, &logs).unwrap();
    let mut server = sh(then);
    server.label = "Server".into();
    PreviewService {
        runtime_id: 0,
        target_id: "t".into(),
        phase: PreviewPhase::Starting,
        url: String::new(),
        command: "test".into(),
        error: None,
        logs,
        started: Instant::now(),
        runtime: PreviewRuntime::Installing(Box::new(Installing {
            current,
            queued: Vec::new(),
            then: vec![server],
            primary_index: 0,
        })),
    }
}

fn settle(service: &mut PreviewService, until: impl Fn(&PreviewService) -> bool) {
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        service.refresh();
        if until(service) {
            return;
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    panic!("did not settle: {:?}", service.status().phase);
}

#[test]
fn a_finished_install_hands_over_to_the_server() {
    let mut service = installing("echo installing; exit 0", "sleep 30");
    assert_eq!(service.status().step, Some(PreviewStep::Installing));
    settle(&mut service, |s| {
        matches!(s.runtime, PreviewRuntime::Processes(_))
    });
    let status = service.status();
    assert_eq!(status.phase, PreviewPhase::Starting);
    assert!(status.url.unwrap().starts_with("http://127.0.0.1:"));
    assert!(matches!(
        status.step,
        Some(PreviewStep::Starting | PreviewStep::Waiting)
    ));
    service.stop();
}

#[test]
fn a_failed_install_is_reported_as_one_and_never_starts_the_server() {
    let mut service = installing("echo 'npm ERR! network'; exit 3", "sleep 30");
    settle(&mut service, |s| s.phase == PreviewPhase::Failed);
    let status = service.status();
    assert_eq!(status.error_code, Some(PreviewErrorCode::InstallFailed));
    assert!(status.hint.is_some());
    assert!(status.url.is_none());
    assert!(matches!(service.runtime, PreviewRuntime::Installing(_)));
}

#[test]
fn a_server_that_exits_is_diagnosed_from_its_output() {
    let mut service = installing("exit 0", "echo 'sh: vite: command not found'; exit 127");
    settle(&mut service, |s| s.phase == PreviewPhase::Failed);
    std::thread::sleep(Duration::from_millis(150));
    assert_eq!(
        service.status().error_code,
        Some(PreviewErrorCode::MissingDependencies)
    );
}

#[test]
fn a_server_listening_only_on_ipv6_is_still_found() {
    let listener = std::net::TcpListener::bind("[::1]:0");
    let Ok(listener) = listener else { return };
    let port = listener.local_addr().unwrap().port();
    let child = Command::new("sleep")
        .arg("30")
        .process_group(0)
        .spawn()
        .unwrap();
    let managed = ManagedChild {
        label: "Server".into(),
        tree: crate::preview::process::TreeGuard::adopt(&child),
        child,
        port,
    };
    let mut service = PreviewService {
        runtime_id: 0,
        target_id: "t".into(),
        phase: PreviewPhase::Starting,
        url: format!("http://127.0.0.1:{port}/"),
        command: "test".into(),
        error: None,
        logs: new_logs(),
        started: Instant::now(),
        runtime: PreviewRuntime::Processes(vec![managed]),
    };
    service.refresh();
    assert_eq!(service.phase, PreviewPhase::Running);
    assert_eq!(service.status().url, Some(format!("http://[::1]:{port}/")));
    service.stop();
}

/// A fresh "clone" with no node_modules, whose `vite` is a local package that
/// serves HTTP on --port. Run with `cargo test -- --ignored real_` (needs npm).
#[test]
#[ignore = "needs npm"]
fn real_fresh_project_installs_then_serves() {
    use std::io::{Read, Write};
    use std::net::TcpStream;

    let dir = tempfile::tempdir().unwrap();
    let write = |name: &str, body: &str| {
        let path = dir.path().join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    };
    write(
        "package.json",
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"file:./fake-vite"}}"#,
    );
    write(
        "fake-vite/package.json",
        r#"{"name":"vite","version":"1.0.0","bin":{"vite":"cli.js"}}"#,
    );
    write(
        "fake-vite/cli.js",
        "#!/usr/bin/env node\nconst a=process.argv;const port=Number(a[a.indexOf('--port')+1]);\nrequire('http').createServer((q,r)=>r.end('hello from vite')).listen(port,'127.0.0.1',()=>console.log('ready',port));\n",
    );
    let root = dir.path().to_str().unwrap();
    let inspection = crate::preview::inspect_project(root).unwrap();
    let target = &inspection.targets[0];
    assert!(inspection.info[&target.id].needs_install);

    let manager = crate::preview::PreviewManager::new();
    let started = manager.start(root, &target.id).unwrap();
    assert_eq!(started.step, Some(PreviewStep::Installing));
    let deadline = Instant::now() + Duration::from_secs(120);
    let status = loop {
        let status = manager.status(root, &target.id).unwrap();
        if status.phase != PreviewPhase::Starting || Instant::now() > deadline {
            break status;
        }
        std::thread::sleep(Duration::from_millis(200));
    };
    assert_eq!(
        status.phase,
        PreviewPhase::Running,
        "{:?} {:?}",
        status.error,
        status.logs
    );
    let url = status.url.unwrap();
    let address = url.trim_start_matches("http://").trim_end_matches('/');
    let mut stream = TcpStream::connect(address).unwrap();
    stream.write_all(b"GET / HTTP/1.0\r\n\r\n").unwrap();
    let mut body = String::new();
    stream.read_to_string(&mut body).unwrap();
    assert!(body.contains("hello from vite"), "{body}");
    manager.stop(root, &target.id).unwrap();
}
