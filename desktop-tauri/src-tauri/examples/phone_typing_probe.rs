//! A Vibyra Desktop's phone connection on loopback, with one real shell, for
//! driving the phone's own session screen against it. Everything past the
//! window is the desktop's: its phone backend, lease rules and live stream over
//! the real encrypted transport. The window is the one thing missing, so this
//! publishes the project and pane it would have shown.
//!
//! `mobile/scripts/verify-desktop-typing.mjs` runs it. On stdin, `approve KEY`
//! answers a pairing request and `typing on|off` flips the Settings switch.
//! A scratch identity and an ephemeral loopback port keep it clear of a Vibyra
//! that is already running.
use std::{
    io::BufRead,
    net::SocketAddr,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use vibyra_core::pty::{FlushConfig, LaunchSpec, OutputSink, PtyManager};
use vibyra_host::EmbeddedHost;

// The desktop's own modules, not copies, so the probe cannot drift from them.
#[allow(dead_code)]
#[path = "../src/phone/backend.rs"]
mod backend;
#[allow(dead_code)]
#[path = "../src/phone/control.rs"]
mod control;
#[allow(dead_code)]
#[path = "../src/phone/frames.rs"]
mod frames;
#[allow(dead_code)]
#[path = "../src/phone/manage.rs"]
mod manage;
#[allow(dead_code)]
#[path = "../src/phone/railway.rs"]
mod railway;
#[allow(dead_code)]
#[path = "../src/phone/railway_resources.rs"]
mod railway_resources;
#[allow(dead_code)]
#[path = "../src/phone/railway_tools.rs"]
mod railway_tools;
#[allow(dead_code)]
#[path = "../src/phone/requests.rs"]
mod requests;
#[allow(dead_code)]
#[path = "../src/phone/scaffold.rs"]
mod scaffold;
#[allow(dead_code)]
#[path = "../src/phone/stream.rs"]
mod stream;
#[allow(dead_code)]
#[path = "../src/phone/vault.rs"]
mod vault;
#[allow(dead_code)]
#[path = "../src/phone/workspace.rs"]
mod workspace;

struct Sink;
impl OutputSink for Sink {
    fn on_output(&self, _: u64, _: String) {}
    fn on_resync(&self, _: u64, _: String) {}
    fn on_exit(&self, _: u64, _: Option<i32>) {}
}

fn main() {
    let mut args = std::env::args().skip(1);
    let (mut project, mut state) = (None, None);
    while let Some(flag) = args.next() {
        match flag.as_str() {
            "--project" => project = args.next(),
            "--state-dir" => state = args.next(),
            other => panic!("unknown argument {other}"),
        }
    }
    let project = project.expect("--project DIR");
    let state = state.expect("--state-dir DIR");
    std::fs::create_dir_all(&state).expect("state directory");
    let manager = PtyManager::new(Arc::new(Sink), FlushConfig::default());
    let shell = LaunchSpec {
        program: "/bin/sh".into(),
        args: vec!["-i".into()],
        env: vec![
            ("PS1".into(), "$ ".into()),
            ("BASH_SILENCE_DEPRECATION_WARNING".into(), "1".into()),
            // The Mac's own terminals inherit the person's UTF-8 locale. Without
            // it readline treats every byte of a `│` or `✔` as a Meta key and
            // jumps the cursor around the line, so a typed box arrives scrambled.
            ("LANG".into(), "en_US.UTF-8".into()),
        ],
        env_remove: vec![],
        cwd: Some(project.clone()),
        rows: 30,
        cols: 100,
    };
    let pane = manager
        .create_session("shell", "zsh", &shell)
        .expect("shell did not start");
    let workspace = workspace::SharedWorkspace::default();
    workspace.write().publish(
        vec![workspace::DesktopProject {
            id: "p-1".into(),
            name: "Typing probe".into(),
            path: project,
        }],
        vec![workspace::DesktopPane {
            id: pane.id,
            project_id: "p-1".into(),
            title: "Mac terminal".into(),
        }],
        None,
    );
    let typing = Arc::new(AtomicBool::new(false));
    let vault = vault::Vault::new(std::path::PathBuf::from(&state));
    let backend = backend::DesktopBackend::new(
        manager.clone(),
        workspace,
        typing.clone(),
        vault,
        Default::default(),
    )
    .expect("desktop backend");
    let host = EmbeddedHost::start(
        state.into(),
        SocketAddr::from(([127, 0, 0, 1], 0)),
        Arc::new(backend),
        "Typing Probe Mac",
    )
    .expect("embedded connection did not start");
    let address = format!("127.0.0.1:{}", host.status()["port"]);
    println!("listening on {address}");
    let invitation = host.invite(&format!("ws://{address}")).expect("invitation");
    println!("{invitation}");
    for line in std::io::stdin().lock().lines() {
        let line = line.expect("stdin");
        match line.split_whitespace().collect::<Vec<_>>().as_slice() {
            ["approve", key] => match host.answer(key, true) {
                Ok(()) => println!("approved {key}"),
                Err(error) => println!("approve failed: {error}"),
            },
            ["typing", "on"] => typing.store(true, Ordering::SeqCst),
            ["typing", "off"] => typing.store(false, Ordering::SeqCst),
            _ => println!("unknown command: {line}"),
        }
    }
    manager.shutdown();
}
