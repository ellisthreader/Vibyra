//! Running one turn, from a person's sentence to a persisted transcript.
//!
//! The order here is deliberate and is the reason this is one function rather
//! than a chain of callbacks:
//!
//! 1. Read the agent, its places, its memory and its skills **now**. A turn is
//!    authorised by the grants in force when it starts, not by whatever they
//!    were when the chat was opened.
//! 2. Assemble the context deterministically and keep its fingerprint.
//! 3. Run the provider, persisting each normalized event as it arrives — so a
//!    crash mid-turn loses the rest of the answer, never the part already
//!    given.
//! 4. Bind the session id the moment the provider names one, because until
//!    that happens the chat cannot be resumed and a crash would strand it.
//!
//! Blocking throughout. The caller owns a blocking thread; nothing here awaits.

use std::sync::Arc;

use vibyra_core::agent_chats::{transcript, ChatEventRow};
use vibyra_core::agent_model::PermissionMode;
use vibyra_core::agent_runtime::{
    adapter::TurnPlan, normalize, run, AgentEvent, TurnExit, TurnOccasion,
};

use super::hub::AgentWorld;
use super::prepare::prepare;

/// What a turn needs beyond the chat it belongs to.
pub struct TurnRequest {
    pub chat_id: String,
    pub prompt: String,
    /// Overrides the agent's own level for this turn only. The composer's
    /// permission control; never a way to exceed what the agent may do, since
    /// the assembler and the adapters both read this same value.
    pub permission: Option<PermissionMode>,
    pub occasion_routine: Option<String>,
    pub occasion_handoff: Option<String>,
    /// Which provider login to run as.
    pub account_id: Option<String>,
}

/// Runs a turn to completion, calling `emit` for every event as it happens.
///
/// Never returns an error for a provider that failed: that is a `turn.failed`
/// event in the transcript, which is a thing the user can read and retry.
/// Errors are reserved for "this turn could not be started at all".
pub fn execute(
    world: &Arc<AgentWorld>,
    request: TurnRequest,
    mut emit: impl FnMut(&ChatEventRow),
) -> Result<(), String> {
    let db = Arc::clone(&world.db);
    let chat = vibyra_core::agent_chats::get(&db, &world.account, &request.chat_id)
        .map_err(|error| error.to_string())?;
    let turn_id = vibyra_core::agentdb::ids::new_id();
    let profile = chat
        .agent_id
        .as_deref()
        .map(|id| vibyra_core::agent_profiles::get(&db, &world.account, id))
        .transpose()
        .map_err(|error| error.to_string())?;

    let permission = request
        .permission
        .or(profile.as_ref().map(|p| p.permission))
        .unwrap_or(PermissionMode::Plan);
    let (places, cwd, system_prompt, applied) =
        prepare(world, &chat, profile.as_ref(), permission, &request)?;

    let record = |event: AgentEvent, emit: &mut dyn FnMut(&ChatEventRow)| {
        if let Ok(row) = transcript::append(&db, &chat.id, &turn_id, event) {
            emit(&row);
        }
    };
    record(
        AgentEvent::TurnStarted {
            prompt: request.prompt.clone(),
            // Recorded on the turn rather than derived from the chat later: a
            // chat's source says a routine opened it, but only the turn knows
            // which routine, and a handoff's sender is not on the chat at all.
            occasion: match (&request.occasion_routine, &request.occasion_handoff) {
                (Some(name), _) => Some(TurnOccasion::Routine { name: name.clone() }),
                (_, Some(from)) => Some(TurnOccasion::Handoff { from: from.clone() }),
                _ => None,
            },
        },
        &mut emit,
    );
    // After the prompt, before the run: a skill is a standing instruction that
    // shaped what follows, so it belongs above the answer it shaped. A turn
    // where nothing matched records nothing — an empty state on every turn
    // would be noise.
    for skill in applied {
        record(
            AgentEvent::SkillApplied {
                skill_id: skill.id,
                name: skill.name,
                version: skill.version,
            },
            &mut emit,
        );
    }
    let _ = vibyra_core::agent_chats::set_state(&db, &chat.id, "running");

    let engine = chat.engine;
    let (env, env_remove) = super::env::for_turn(engine.as_str(), request.account_id.as_deref());
    let planned = TurnPlan {
        engine,
        session: chat.session_id.clone(),
        permission,
        cwd,
        places,
        model: profile.as_ref().and_then(|p| p.model.clone()),
        effort: profile.as_ref().and_then(|p| p.effort.clone()),
        images: vibyra_core::agent_chats::attachments::images(&db, &chat.id).unwrap_or_default(),
        prompt: request.prompt.clone(),
        system_prompt,
        env,
        env_remove,
    }
    .build();

    // Claude's id is known before the process starts, so bind it now: a crash
    // during the very first turn must still leave a resumable chat.
    if let Some(session) = planned.session.as_deref() {
        let _ = vibyra_core::agent_chats::bind_session(&db, &chat.id, session);
    }

    let handle = world.begin(&chat.id);
    let mut assistant_text = String::new();
    let outcome = run(planned.command, &handle, |line| {
        for event in normalize(engine, line) {
            if let AgentEvent::SessionIdentified { session_id } = &event {
                let _ = vibyra_core::agent_chats::bind_session(&db, &chat.id, session_id);
            }
            if let AgentEvent::AssistantCompleted { text } = &event {
                assistant_text.push_str(text);
                assistant_text.push('\n');
            }
            record(event, &mut emit);
        }
    });
    world.finish(&chat.id);

    // A turn that is over cannot still be asking questions.
    let _ = vibyra_core::approvals::invalidate_turn(&db, &turn_id);

    let closing = match outcome {
        Ok(TurnExit::Completed) => None,
        Ok(TurnExit::Cancelled) => Some(AgentEvent::TurnFailed {
            message: "Stopped. The conversation is intact — send again to continue.".into(),
        }),
        Ok(TurnExit::Failed(detail)) => Some(AgentEvent::TurnFailed { message: detail }),
        Err(error) => Some(AgentEvent::TurnFailed {
            message: error.to_string(),
        }),
    };
    let failed = closing.is_some();
    if let Some(event) = closing {
        record(event, &mut emit);
    }
    let _ =
        vibyra_core::agent_chats::set_state(&db, &chat.id, if failed { "failed" } else { "idle" });
    if !failed {
        if let Some(profile) = profile.as_ref() {
            super::reflect::after_turn(&db, profile, &chat.id, &turn_id, &assistant_text);
        }
        if chat.title.trim().is_empty() {
            let _ = vibyra_core::agent_chats::amend(
                &db,
                &world.account,
                &chat.id,
                Some(&super::title::from_prompt(&request.prompt)),
                None,
                None,
            );
        }
    }
    Ok(())
}
