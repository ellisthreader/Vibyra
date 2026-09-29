use std::sync::Arc;
use std::time::Instant;

use crate::{CoreError, CoreResult};

use super::desktop_run::DesktopRun;
use super::detect::detect_target_with;
use super::launch_plan::{desktop_env, HostOs};
use super::process::{new_logs, push_log, reserve_port, spawn_process, terminate};
use super::process_spawn::spawn_desktop;
use super::refresher::DesktopProbe;
use super::service::{PreviewRuntime, PreviewService};
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
        } => {
            if primary_index >= processes.len() {
                return Err(CoreError::Preview(
                    "preview launch profile is invalid".into(),
                ));
            }
            let reservations = (0..processes.len())
                .map(|_| reserve_port())
                .collect::<CoreResult<Vec<_>>>()?;
            let mut children = Vec::new();
            let mut commands = Vec::new();
            for (spec, reservation) in processes.iter().zip(reservations) {
                let port = reservation.release();
                match spawn_process(spec, port, &logs) {
                    Ok((child, command)) => {
                        children.push(child);
                        commands.push(command);
                    }
                    Err(error) => {
                        for child in &mut children {
                            terminate(child);
                        }
                        return Err(error);
                    }
                }
            }
            let primary_port = children[primary_index].port;
            (
                PreviewRuntime::Processes(children),
                format!("http://127.0.0.1:{primary_port}/"),
                commands.join(" + "),
                PreviewPhase::Starting,
            )
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
