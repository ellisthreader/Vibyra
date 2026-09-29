use std::process::{Command, Stdio};
use std::sync::Arc;

use crate::{CoreError, CoreResult};

use super::launch_plan::EnvPlan;
use super::process::{push_log, LogBuffer, ManagedChild};
use super::process_kill::TreeGuard;
use super::process_output::stream_output;
use super::types::ProcessSpec;

pub(crate) fn spawn_process(
    spec: &ProcessSpec,
    port: u16,
    logs: &LogBuffer,
) -> CoreResult<(ManagedChild, String)> {
    spawn(spec, port, logs, &EnvPlan::default())
}

/// A desktop app has no port; `plan` puts its window where Vibyra can show it.
pub(crate) fn spawn_desktop(
    spec: &ProcessSpec,
    logs: &LogBuffer,
    plan: &EnvPlan,
) -> CoreResult<(ManagedChild, String)> {
    spawn(spec, 0, logs, plan)
}

fn spawn(
    spec: &ProcessSpec,
    port: u16,
    logs: &LogBuffer,
    plan: &EnvPlan,
) -> CoreResult<(ManagedChild, String)> {
    let args = spec
        .args
        .iter()
        .map(|arg| render(arg, port))
        .collect::<Vec<_>>();
    let program = crate::launch_env::resolve_program(&spec.program);
    let mut command = Command::new(&program);
    // An AppImage build must not hand its bundled GTK/WebKit paths to the
    // project, least of all to a GUI app linking its own.
    crate::launch_env::sanitize_command(&mut command);
    for key in &plan.remove {
        command.env_remove(key);
    }
    command
        .args(&args)
        .current_dir(&spec.cwd)
        .envs(plan.set.iter().map(|(key, value)| (key, value)))
        .envs(
            spec.env
                .iter()
                .map(|(key, value)| (key, render(value, port))),
        )
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if spec.label == "Expo web" {
        // Node can otherwise bind localhost only on ::1 while readiness and the frame use IPv4.
        let options = std::env::var("NODE_OPTIONS").unwrap_or_default();
        command.env(
            "NODE_OPTIONS",
            format!("{options} --dns-result-order=ipv4first"),
        );
        command.env("BROWSER", "none");
    }
    configure_tree(&mut command);
    let mut child = command.spawn().map_err(|error| {
        CoreError::Preview(format!("could not start {}: {error}", spec.program))
    })?;
    let tree = TreeGuard::adopt(&child);
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
            tree,
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
fn configure_tree(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

/// No console window flashes up for the package manager, and the tree is
/// adopted by a job object right after it starts.
#[cfg(windows)]
fn configure_tree(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NEW_PROCESS_GROUP: u32 = 0x0000_0200;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW);
}

#[cfg(not(any(unix, windows)))]
fn configure_tree(_command: &mut Command) {}
