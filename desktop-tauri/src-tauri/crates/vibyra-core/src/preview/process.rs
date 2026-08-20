use std::collections::VecDeque;
use std::net::TcpListener;
use std::process::{Child, Command, Stdio};
use std::sync::Arc;
#[cfg(unix)]
use std::thread;
#[cfg(unix)]
use std::time::Duration;

use parking_lot::Mutex;

use crate::{CoreError, CoreResult};

use super::process_output::stream_output;
use super::types::ProcessSpec;

pub(crate) type LogBuffer = Arc<Mutex<VecDeque<String>>>;

pub(crate) struct ManagedChild {
    pub label: String,
    pub child: Child,
    pub port: u16,
}

pub(crate) fn new_logs() -> LogBuffer {
    Arc::new(Mutex::new(VecDeque::with_capacity(160)))
}

pub(crate) fn push_log(logs: &LogBuffer, line: impl Into<String>) {
    let mut logs = logs.lock();
    let line = line.into();
    logs.push_back(if line.chars().count() > 1000 {
        format!("{}…", line.chars().take(1000).collect::<String>())
    } else {
        line
    });
    while logs.len() > 160 {
        logs.pop_front();
    }
}

pub(crate) fn snapshot_logs(logs: &LogBuffer) -> Vec<String> {
    logs.lock().iter().cloned().collect()
}

pub(crate) struct PortReservation {
    listener: TcpListener,
    pub(crate) port: u16,
}

impl PortReservation {
    pub(crate) fn release(self) -> u16 {
        let Self { listener, port } = self;
        drop(listener);
        port
    }
}

pub(crate) fn reserve_port() -> CoreResult<PortReservation> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    let port = listener.local_addr()?.port();
    Ok(PortReservation { listener, port })
}

pub(crate) fn preview_command(spec: &ProcessSpec) -> String {
    spec.env
        .iter()
        .map(|(key, value)| format!("{key}={}", preview_value(value)))
        .chain(std::iter::once(spec.program.clone()))
        .chain(spec.args.iter().map(|arg| preview_value(arg)))
        .collect::<Vec<_>>()
        .join(" ")
}

fn preview_value(value: &str) -> String {
    value.replace("{port}", "<available>")
}

pub(crate) fn spawn_process(
    spec: &ProcessSpec,
    port: u16,
    logs: &LogBuffer,
) -> CoreResult<(ManagedChild, String)> {
    let args = spec
        .args
        .iter()
        .map(|arg| render(arg, port))
        .collect::<Vec<_>>();
    let mut command = Command::new(&spec.program);
    command
        .args(&args)
        .current_dir(&spec.cwd)
        .envs(
            spec.env
                .iter()
                .map(|(key, value)| (key, render(value, port))),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_process_group(&mut command);
    let mut child = command.spawn().map_err(|error| {
        CoreError::Preview(format!("could not start {}: {error}", spec.program))
    })?;
    if let Some(stdout) = child.stdout.take() {
        stream_output(stdout, format!("[{}]", spec.label), Arc::clone(logs));
    }
    if let Some(stderr) = child.stderr.take() {
        stream_output(stderr, format!("[{} error]", spec.label), Arc::clone(logs));
    }
    let display = display_command(&spec.program, &args);
    push_log(logs, format!("$ {display}"));
    Ok((
        ManagedChild {
            label: spec.label.clone(),
            child,
            port,
        },
        display,
    ))
}

fn render(value: &str, port: u16) -> String {
    value.replace("{port}", &port.to_string())
}

fn display_command(program: &str, args: &[String]) -> String {
    std::iter::once(program.to_owned())
        .chain(args.iter().map(|arg| {
            if arg.contains([' ', '\t']) {
                format!(r#""{}""#, arg)
            } else {
                arg.clone()
            }
        }))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(not(any(unix, windows)))]
fn configure_process_group(_command: &mut Command) {}

#[cfg(windows)]
fn configure_process_group(_command: &mut Command) {}

pub(crate) fn terminate(child: &mut ManagedChild) {
    if child.child.try_wait().ok().flatten().is_some() {
        return;
    }
    terminate_group(&mut child.child);
}

#[cfg(unix)]
fn terminate_group(child: &mut Child) {
    let pid = child.id() as i32;
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    for _ in 0..10 {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
    let _ = child.wait();
}

#[cfg(windows)]
fn terminate_group(child: &mut Child) {
    let pid = child.id().to_string();
    let _ = Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = child.wait();
}

#[cfg(not(any(unix, windows)))]
fn terminate_group(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}
