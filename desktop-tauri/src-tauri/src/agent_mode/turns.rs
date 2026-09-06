//! One durable task lifecycle for direct, scheduled and delegated work.
use super::hub::AgentWorld;
use std::sync::Arc;
use vibyra_core::agent_chats::ChatEventRow;
use vibyra_core::agent_model::PermissionMode;
use vibyra_core::agent_runs::{self, RunOutcome, RunSpec, RunStatus};

pub struct TurnRequest {
    pub chat_id: String,
    pub prompt: String,
    pub permission: Option<PermissionMode>,
    pub occasion_routine: Option<String>,
    pub occasion_handoff: Option<String>,
    pub account_id: Option<String>,
}

pub fn execute(
    world: &Arc<AgentWorld>,
    request: TurnRequest,
    mut emit: impl FnMut(&ChatEventRow),
) -> Result<RunOutcome, String> {
    let claim = super::turn_claim::TurnClaim::new(world, &request.chat_id)?;
    let chat = vibyra_core::agent_chats::get(&world.db, &world.account, &request.chat_id)
        .map_err(|e| e.to_string())?;
    let profile = chat
        .agent_id
        .as_deref()
        .map(|id| vibyra_core::agent_profiles::get(&world.db, &world.account, id))
        .transpose()
        .map_err(|e| e.to_string())?;
    if profile.as_ref().is_some_and(|p| p.archived_ms.is_some()) {
        return Err("Restore this teammate before starting a task.".into());
    }
    let ceiling = if chat.archived_ms.is_some() {
        return Err("Restore this chat before starting a task.".into());
    } else {
        profile
            .as_ref()
            .map(|p| p.permission)
            .unwrap_or(if chat.mounted_place.is_some() {
                PermissionMode::Standard
            } else {
                PermissionMode::Plan
            })
    };
    let permission = request.permission.unwrap_or(ceiling).min(ceiling);
    if request.prompt.trim().is_empty() || request.prompt.len() > 100_000 {
        return Err("A task needs a prompt of at most 100,000 bytes.".into());
    }
    let account_id = request.account_id.as_deref().unwrap_or("default");
    super::env::for_turn(chat.engine.as_str(), Some(account_id))?;
    if chat.session_id.is_some() {
        if let Some(previous) = agent_runs::list(&world.db, &world.account, Some(&chat.id))
            .map_err(|e| e.to_string())?
            .first()
        {
            if previous.spec.account_id.as_deref().unwrap_or("default") != account_id {
                return Err("Start a new chat to use a different provider account.".into());
            }
        }
    }
    let mut prepared =
        super::prepare::prepare(world, &chat, profile.as_ref(), permission, &request)?;
    let inputs = super::attachments::include(world, &chat, &mut prepared)?;
    if prepared.context.len() > 500_000 {
        return Err(
            "The task context exceeds 500,000 bytes. Shorten the brief or attached material."
                .into(),
        );
    }
    let capability = super::probe_engines()
        .into_iter()
        .find(|c| c.engine == chat.engine)
        .ok_or("This provider is unavailable.")?;
    let spec = RunSpec {
        agent_name: profile
            .as_ref()
            .map(|p| p.name.clone())
            .unwrap_or_else(|| "Chat".into()),
        engine: chat.engine,
        model: profile.as_ref().and_then(|p| p.model.clone()),
        effort: profile.as_ref().and_then(|p| p.effort.clone()),
        account_id: Some(account_id.into()),
        permission,
        cwd: prepared.cwd.clone(),
        places: prepared.places.clone(),
        prompt: request.prompt.clone(),
        context: prepared.context.clone(),
        context_fingerprint: prepared.fingerprint.clone(),
        provider_version: capability.snapshot(),
        timeout_ms: 60 * 60 * 1000,
        max_tool_calls: 100,
    };
    let id = vibyra_core::agentdb::ids::new_id();
    let run = agent_runs::begin(
        &world.db,
        &id,
        &world.account,
        &chat.id,
        chat.agent_id.as_deref(),
        spec,
    )
    .map_err(|e| e.to_string())?;
    if let Err(message) = super::attachments::record(world, &chat.id, &id) {
        agent_runs::finish(
            &world.db,
            &world.account,
            &id,
            &RunOutcome {
                status: RunStatus::Failed,
                message: Some(message.clone()),
            },
        )
        .map_err(|e| e.to_string())?;
        return Err(message);
    }
    world.changed(&chat.id);
    let deadline = vibyra_core::agent_runtime::deadline::Deadline::start(
        claim.handle.clone(),
        std::time::Duration::from_millis(run.spec.timeout_ms),
    );
    let mut outcome = if !capability.structured {
        RunOutcome {
            status: RunStatus::Failed,
            message: Some(capability.blocker),
        }
    } else {
        super::turn_execute::perform(
            super::turn_execute::Execution {
                world,
                chat: &chat,
                task: &run,
                request: &request,
                handle: &claim.handle,
            },
            prepared,
            inputs,
            &mut emit,
        )
        .unwrap_or_else(|message| RunOutcome {
            status: RunStatus::Failed,
            message: Some(message),
        })
    };
    if deadline.expired() {
        outcome = RunOutcome {
            status: RunStatus::Failed,
            message: Some("Task reached its time limit.".into()),
        };
    } else if claim.handle.cancelled() && outcome.status != RunStatus::Failed {
        outcome = RunOutcome {
            status: RunStatus::Cancelled,
            message: Some("Stopped by the user.".into()),
        };
    }
    drop(deadline);
    let invalidated = vibyra_core::approvals::invalidate_turn(&world.db, &id);
    agent_runs::finish(&world.db, &world.account, &id, &outcome).map_err(|e| e.to_string())?;
    if outcome.status != RunStatus::Succeeded {
        let row = vibyra_core::agent_chats::transcript::append(
            &world.db,
            &chat.id,
            &id,
            vibyra_core::agent_runtime::AgentEvent::TurnFailed {
                message: outcome
                    .message
                    .clone()
                    .unwrap_or_else(|| "The task did not complete.".into()),
            },
        )
        .map_err(|e| e.to_string())?;
        emit(&row);
    }
    world.changed(&chat.id);
    invalidated.map_err(|e| e.to_string())?;
    if outcome.status == RunStatus::Succeeded && chat.title.trim().is_empty() {
        vibyra_core::agent_chats::amend(
            &world.db,
            &world.account,
            &chat.id,
            Some(&super::title::from_prompt(&request.prompt)),
            None,
            None,
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(outcome)
}
