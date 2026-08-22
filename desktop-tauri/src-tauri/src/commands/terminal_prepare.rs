use std::path::{Path, PathBuf};

use vibyra_core::agents::{resolve_agents, AgentSpec};
use vibyra_core::pty::LaunchSpec;
use vibyra_core::workspace::prepare_safe_workspace;
use vibyra_core::{CoreError, CoreResult};

use super::terminal_launch::{
    canonical_directory, configure_launch, isolate_account_environment, select_launch_account,
    CreateTerminalRequest,
};
use crate::provider_auth_process::credential_env_names;

/// Everything `PtyManager::create_session` needs, resolved off the async
/// runtime. Preparing a launch scans PATH for every agent, canonicalizes the
/// project folder and — in safe mode — runs a six-command `git` chain, so it
/// belongs on a blocking thread rather than a runtime worker.
pub struct PreparedSession {
    pub agent_id: String,
    pub title: String,
    pub spec: LaunchSpec,
}

pub struct LaunchContext {
    pub default_shell: Option<String>,
    pub custom_agents: Vec<AgentSpec>,
    pub workspace_root: Option<String>,
    pub worktrees_root: PathBuf,
}

pub fn prepare(
    request: CreateTerminalRequest,
    context: LaunchContext,
) -> CoreResult<PreparedSession> {
    let agents = resolve_agents(&context.custom_agents);
    let agent = agents
        .iter()
        .find(|agent| agent.spec.id == request.agent_id)
        .ok_or_else(|| CoreError::InvalidPath(format!("unknown agent: {}", request.agent_id)))?;

    let source_cwd = canonical_directory(request.cwd.clone().or(context.workspace_root))?;
    let effective_cwd = resolve_cwd(&request, source_cwd, &context.worktrees_root)?;

    let mut spec = agent
        .spec
        .launch_spec(effective_cwd, context.default_shell.clone());
    isolate_account_environment(
        &mut spec,
        &agent.spec.id,
        agent.spec.custom,
        credential_env_names(),
    );
    if !agent.spec.custom {
        select_launch_account(&mut spec, &agent.spec.id, request.account_id.as_deref());
    }
    configure_launch(&mut spec, &request)?;
    Ok(PreparedSession {
        agent_id: agent.spec.id.clone(),
        title: agent.spec.name.clone(),
        spec,
    })
}

fn resolve_cwd(
    request: &CreateTerminalRequest,
    source_cwd: Option<String>,
    worktrees_root: &Path,
) -> CoreResult<Option<String>> {
    match request.workspace_mode.as_deref().unwrap_or("shared") {
        "shared" => Ok(source_cwd),
        "safe" => {
            let source = source_cwd.ok_or_else(|| {
                CoreError::InvalidPath("Safe mode needs a project folder".to_string())
            })?;
            let safe = prepare_safe_workspace(
                Path::new(&source),
                worktrees_root,
                request.safe_snapshot_fingerprint.as_deref(),
            )?;
            Ok(Some(safe.to_string_lossy().to_string()))
        }
        value => Err(CoreError::Settings(format!(
            "unknown workspace mode: {value}"
        ))),
    }
}
