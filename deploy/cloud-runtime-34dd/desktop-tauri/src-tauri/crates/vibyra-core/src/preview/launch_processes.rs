use crate::{CoreError, CoreResult};

use super::process::{reserve_port, spawn_process, terminate, LogBuffer, ManagedChild};
use super::types::ProcessSpec;

/// Spawns a recipe's processes, each on a port that was held until its own
/// child started. Returns the children, the primary one's URL and the commands run.
pub(crate) fn start_processes(
    processes: &[ProcessSpec],
    primary_index: usize,
    logs: &LogBuffer,
) -> CoreResult<(Vec<ManagedChild>, String, String)> {
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
        match spawn_process(spec, port, logs) {
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
    Ok((
        children,
        format!("http://127.0.0.1:{primary_port}/"),
        commands.join(" + "),
    ))
}
