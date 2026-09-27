use std::collections::HashMap;
use std::process::{Command, Stdio};
use std::sync::{Mutex, OnceLock};

use serde::Serialize;
use tauri::State;
use vibyra_core::agents::{npm_package, program_in_path, resolve_agents, ResolvedAgent};

use crate::state::AppState;

/// Node ships npm as a shell script on Windows, which `CreateProcess` will not
/// run by name. Same reasoning as `provider_auth_install.rs`.
#[cfg(windows)]
const LAUNCHER: &str = "cmd";
#[cfg(not(windows))]
const LAUNCHER: &str = "npm";

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentInstall {
    pub running: bool,
    pub error: Option<String>,
}

/// Installs in flight, by agent id. A module-level map rather than a field on
/// `AppState`: nothing else needs it, and it must outlive any one window.
fn installs() -> &'static Mutex<HashMap<String, AgentInstall>> {
    static INSTALLS: OnceLock<Mutex<HashMap<String, AgentInstall>>> = OnceLock::new();
    INSTALLS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn arguments(package: &str) -> Vec<String> {
    let install = ["install", "--global", package];
    #[cfg(windows)]
    {
        let mut args = vec!["/C".to_string(), "npm".to_string()];
        args.extend(install.iter().map(|value| (*value).to_string()));
        args
    }
    #[cfg(not(windows))]
    {
        install.iter().map(|value| (*value).to_string()).collect()
    }
}

/// Installs an agent's CLI with npm.
///
/// Returns as soon as the child is running: a global npm install is minutes
/// long, and an IPC call blocked that long looks like a hung app. The frontend
/// polls `list_agents` for the command appearing and `agent_installs` for a
/// failure, which is the only way a failed install can ever be reported —
/// otherwise it would poll forever for a program that is never going to exist.
#[tauri::command]
pub async fn install_agent_cli(agent: String) -> Result<(), String> {
    let Some(package) = npm_package(&agent) else {
        return Err(format!(
            "Vibyra does not install {agent} itself. Its own instructions cover it."
        ));
    };
    if !program_in_path(LAUNCHER) && !program_in_path("npm") {
        return Err(format!(
            "Installing this needs npm, which this machine does not have. \
             Install Node.js, then run: npm install --global {package}"
        ));
    }
    if installs()
        .lock()
        .map_err(|_| "Install state is unavailable.".to_string())?
        .get(&agent)
        .is_some_and(|state| state.running)
    {
        return Ok(());
    }

    let child = Command::new(LAUNCHER)
        .args(arguments(package))
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start npm: {error}"))?;

    set(
        &agent,
        AgentInstall {
            running: true,
            error: None,
        },
    );
    let id = agent.clone();
    let package = package.to_string();
    std::thread::spawn(move || {
        let error = match child.wait_with_output() {
            Ok(output) if output.status.success() => None,
            Ok(output) => Some(failure(&output.stderr, &package)),
            Err(error) => Some(format!("The install could not be run: {error}")),
        };
        set(
            &id,
            AgentInstall {
                running: false,
                error,
            },
        );
    });
    Ok(())
}

/// npm's last meaningful line, or a sentence naming the command to try by hand.
fn failure(stderr: &[u8], package: &str) -> String {
    let text = String::from_utf8_lossy(stderr);
    let line = text
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty() && !line.starts_with("npm notice"))
        .unwrap_or_default();
    if line.is_empty() {
        format!("The install failed. Try it in a terminal: npm install --global {package}")
    } else {
        line.chars().take(200).collect()
    }
}

fn set(agent: &str, state: AgentInstall) {
    if let Ok(mut map) = installs().lock() {
        map.insert(agent.to_string(), state);
    }
}

/// What every install this session is doing, so a row can show "Installing…"
/// and, more importantly, can stop and say why when one fails.
#[tauri::command]
pub fn agent_installs() -> HashMap<String, AgentInstall> {
    installs().lock().map(|map| map.clone()).unwrap_or_default()
}

/// Clears a finished install's error once the user has seen it.
#[tauri::command]
pub fn clear_agent_install(agent: String) {
    if let Ok(mut map) = installs().lock() {
        map.remove(&agent);
    }
}

/// `list_agents`, re-resolved. Used right after an install so the caller does
/// not have to guess how long PATH takes to notice a new global binary.
#[tauri::command]
pub async fn refresh_agents(state: State<'_, AppState>) -> Result<Vec<ResolvedAgent>, String> {
    let custom = state.settings.lock().custom_agents.clone();
    Ok(resolve_agents(&custom))
}

#[cfg(test)]
#[path = "agent_install_tests.rs"]
mod tests;
