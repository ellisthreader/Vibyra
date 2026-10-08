use std::sync::Arc;
use std::time::Instant;

use crate::{CoreError, CoreResult};

use super::desktop_run::DesktopRun;
use super::detect::detect_target_with;
use super::launch_plan::{desktop_env, HostOs};
use super::launch_processes::start_processes;
use super::process::{new_logs, preview_command, push_log, spawn_process};
use super::process_spawn::spawn_desktop;
use super::refresher::DesktopProbe;
use super::service::{PreviewRuntime, PreviewService};
use super::service_install::Installing;
use super::static_server::StaticServer;
use super::types::{DesktopCommand, LaunchRecipe, PreviewPhase};

pub fn launch(
    root: &str,
    target_id: &str,
    custom: &[DesktopCommand],
    probe: Option<Arc<dyn DesktopProbe>>,
) -> CoreResult<PreviewService> {
    let detected = detect_target_with(root, target_id, custom)?;
    if !detected.target.runnable {
        return Err(CoreError::Preview(
            detected
                .target
                .reason
                .unwrap_or_else(|| "target is not runnable".into()),
        ));
    }
    let logs = new_logs();
    push_log(&logs, format!("Preparing {}", detected.target.name));
    let (runtime, url, command, phase) = match detected.recipe {
        LaunchRecipe::Static { root, entry } => launch_static(root, entry, &logs)?,
        LaunchRecipe::Processes {
            processes,
            primary_index,
            install,
        } => {
            if let Some((first, rest)) = install.split_first() {
                // Dependencies first; the servers start when the install is done.
                if primary_index >= processes.len() {
                    return Err(CoreError::Preview(
                        "preview launch profile is invalid".into(),
                    ));
                }
                push_log(&logs, "Installing dependencies before starting");
                let (current, _) = spawn_process(first, 0, &logs)?;
                let command = processes
                    .iter()
                    .map(preview_command)
                    .collect::<Vec<_>>()
                    .join(" + ");
                let state = Installing {
                    current,
                    queued: rest.to_vec(),
                    then: processes,
                    primary_index,
                };
                (
                    PreviewRuntime::Installing(Box::new(state)),
                    String::new(),
                    command,
                    PreviewPhase::Starting,
                )
            } else {
                let (children, url, command) = start_processes(&processes, primary_index, &logs)?;
                (
                    PreviewRuntime::Processes(children),
                    url,
                    command,
                    PreviewPhase::Starting,
                )
            }
        }
        LaunchRecipe::Desktop { process } => {
            let plan = desktop_env(HostOs::current(), &|key| std::env::var(key).ok())
                .map_err(CoreError::Preview)?;
            let (child, command) = spawn_desktop(&process, &logs, &plan)?;
            (
                PreviewRuntime::Desktop(DesktopRun::new(child, probe)),
                String::new(),
                command,
                PreviewPhase::Starting,
            )
        }
        LaunchRecipe::Unsupported => {
            return Err(CoreError::Preview("target is not runnable".into()));
        }
    };
    Ok(PreviewService {
        runtime_id: 0,
        target_id: target_id.into(),
        phase,
        url,
        command,
        error: None,
        logs,
        started: Instant::now(),
        runtime,
    })
}

fn launch_static(
    root: std::path::PathBuf,
    entry: std::path::PathBuf,
    logs: &super::process::LogBuffer,
) -> CoreResult<(PreviewRuntime, String, String, PreviewPhase)> {
    let server = StaticServer::start(root, entry)?;
    let url = format!("http://127.0.0.1:{}/", server.port);
    push_log(logs, format!("Serving project at {url}"));
    Ok((
        PreviewRuntime::Static(server),
        url,
        "Vibyra static server".into(),
        PreviewPhase::Running,
    ))
}
