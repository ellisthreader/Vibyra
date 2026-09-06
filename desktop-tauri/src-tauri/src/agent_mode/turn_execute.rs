use super::{hub::AgentWorld, prepare::Prepared, turns::TurnRequest};
use std::sync::Arc;
use vibyra_core::agent_chats::{transcript, AgentChat, ChatEventRow};
use vibyra_core::agent_runs::{AgentRun, RunOutcome, RunStatus};
use vibyra_core::agent_runtime::{normalize, run, AgentEvent, TurnHandle, TurnOccasion};

pub(super) struct Execution<'a> {
    pub world: &'a Arc<AgentWorld>,
    pub chat: &'a AgentChat,
    pub task: &'a AgentRun,
    pub request: &'a TurnRequest,
    pub handle: &'a TurnHandle,
}

pub(super) fn perform(
    execution: Execution<'_>,
    prepared: Prepared,
    inputs: super::attachments::Inputs,
    emit: &mut dyn FnMut(&ChatEventRow),
) -> Result<RunOutcome, String> {
    let Execution {
        world,
        chat,
        task,
        request,
        handle,
    } = execution;
    let record = |event, emit: &mut dyn FnMut(&ChatEventRow)| -> Result<(), String> {
        let row =
            transcript::append(&world.db, &chat.id, &task.id, event).map_err(|e| e.to_string())?;
        emit(&row);
        if row.seq >= 0 {
            world.changed(&chat.id);
        }
        Ok(())
    };
    record(
        AgentEvent::TurnStarted {
            prompt: request.prompt.clone(),
            occasion: match (&request.occasion_routine, &request.occasion_handoff) {
                (Some(name), _) => Some(TurnOccasion::Routine { name: name.clone() }),
                (_, Some(from)) => Some(TurnOccasion::Handoff { from: from.clone() }),
                _ => None,
            },
        },
        emit,
    )?;
    let bridge = super::gate::bridge_for(&chat.id, &task.id)
        .ok_or("The approval service is unavailable. Restart Vibyra before running a task.")?;
    for skill in &prepared.applied {
        record(
            AgentEvent::SkillApplied {
                skill_id: skill.id.clone(),
                name: skill.name.clone(),
                version: skill.version,
            },
            emit,
        )?;
    }
    let (planned, images) = super::turn_command::build(&execution, prepared, inputs, &bridge)?;
    let mut answer = String::new();
    let mut failure = None;
    let mut tools = 0;
    let mut completed = false;
    let mut on_event = |event: AgentEvent| {
        if failure.is_some() {
            return;
        }
        if let AgentEvent::TurnCompleted { .. } = event {
            completed = true;
        }
        if let AgentEvent::SessionIdentified { session_id } = &event {
            if let Err(error) =
                vibyra_core::agent_chats::bind_session(&world.db, &chat.id, session_id)
            {
                failure = Some(error.to_string());
                handle.cancel();
                return;
            }
        }
        if let AgentEvent::ToolRequested { .. } = event {
            tools += 1;
            if tools > task.spec.max_tool_calls {
                failure = Some("Task reached its tool-call limit.".into());
                handle.cancel();
                return;
            }
        }
        if let AgentEvent::AssistantCompleted { text } = &event {
            if answer.len() + text.len() <= 2 * 1024 * 1024 {
                answer.push_str(text);
                answer.push(char::from(10));
            } else {
                failure = Some("Task response exceeded the 2 MiB output limit.".into());
                handle.cancel();
                return;
            }
        }
        if let AgentEvent::ToolOutput { .. } = &event {
            if let Err(error) = vibyra_core::agent_runs::save_artifact(
                &world.db,
                &world.account,
                &task.id,
                "execution",
                "Tool execution record",
                &serde_json::to_string(&event).unwrap_or_default(),
            ) {
                failure = Some(error.to_string());
                handle.cancel();
                return;
            }
        }
        if let AgentEvent::TurnFailed { message } = &event {
            failure = Some(message.clone());
            handle.cancel();
            return;
        }
        if let Err(error) = record(event, emit) {
            failure = Some(error);
            handle.cancel();
        }
    };
    let exit = if chat.engine == vibyra_core::agent_model::Engine::Codex {
        super::codex_server::run(
            super::codex_server::ServerTurn {
                chat,
                task,
                images: &images,
                bridge: &bridge,
                handle,
                state_root: &world.root,
            },
            planned.command,
            &mut on_event,
            |kind, title, content| {
                vibyra_core::agent_runs::save_artifact(
                    &world.db,
                    &world.account,
                    &task.id,
                    kind,
                    title,
                    content,
                )
                .map(|_| ())
                .map_err(|e| e.to_string())
            },
        )
        .map_err(vibyra_core::CoreError::Task)
    } else {
        run(planned.command, handle, |line| {
            for event in normalize(chat.engine, line) {
                on_event(event);
            }
        })
    };
    if failure.is_none()
        && !completed
        && matches!(exit, Ok(vibyra_core::agent_runtime::TurnExit::Completed))
    {
        failure = Some("Provider exited without confirming the task completed.".into());
    }
    let outcome = failure
        .map(|message| RunOutcome {
            status: RunStatus::Failed,
            message: Some(message),
        })
        .unwrap_or_else(|| {
            if handle.cancelled() {
                RunOutcome {
                    status: RunStatus::Cancelled,
                    message: Some("Stopped by the user.".into()),
                }
            } else {
                RunOutcome::from_exit(exit)
            }
        });
    super::turn_output::save(&execution, &outcome, &answer)?;
    Ok(outcome)
}
