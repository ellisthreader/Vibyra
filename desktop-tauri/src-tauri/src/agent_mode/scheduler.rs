//! The routine tick.
//!
//! One thread, one minute apart, doing as little as possible. It exists only
//! while Vibyra is open, and the UI says so plainly rather than implying
//! otherwise — a desktop app is not a server, and a routine that claims to
//! have run overnight when the laptop was shut is worse than one that admits
//! it did not.
//!
//! The tick itself makes no decisions: `routines::plan_tick` does, so the
//! policy is testable without a clock. This file is the part that cannot be
//! tested that way — the thread, the fresh chat per run, and the event that
//! tells the UI something moved.

use std::sync::Arc;
use std::time::Duration;

use chrono::Utc;
use tauri::{AppHandle, Emitter};
use vibyra_core::agent_model::ChatSource;
use vibyra_core::routines::{self, runs};

use super::hub::AgentHub;
use super::turns::{execute, TurnRequest};

/// How often the scheduler looks. A minute is the finest a civil-time rule can
/// mean, and anything shorter is a wake-up that finds nothing.
const TICK: Duration = Duration::from_secs(60);

/// Starts the tick thread. Runs for the life of the process; it is a no-op
/// whenever no account is signed in.
pub fn start(app: AppHandle, hub: Arc<AgentHub>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(TICK);
        tick(&app, &hub);
    });
}

/// One pass. Every failure is swallowed deliberately: a scheduler that panics
/// or gives up stops every routine the user has, and the failure it hit is
/// almost always one routine's problem.
fn tick(app: &AppHandle, hub: &Arc<AgentHub>) {
    // `current` rather than `world`: a routine must never be the thing that
    // creates a signed-out account's database.
    let Some(world) = hub.current() else {
        return;
    };
    if paused(app) {
        return;
    }
    let now = Utc::now();
    let Ok((due, missed)) = routines::plan_tick(&world.db, now) else {
        return;
    };

    for routine in missed {
        let scheduled = routine.next_run_ms.unwrap_or(0);
        let _ = runs::skip(&world.db, &routine.id, scheduled);
        let _ = runs::advance_past(&world.db, &routine.id, now);
        let _ = app.emit("routine-status", &routine.id);
    }

    for routine in due {
        let scheduled = routine.next_run_ms.unwrap_or(0);
        // Advanced *before* the run, not after: a routine whose turn takes
        // twenty minutes must not still be due when the next tick looks.
        let _ = runs::advance_past(&world.db, &routine.id, now);

        let Ok(chat) = vibyra_core::agent_chats::create(
            &world.db,
            &world.account,
            vibyra_core::agent_chats::NewChat {
                agent_id: Some(routine.agent_id.clone()),
                engine: engine_for(&world, &routine.agent_id),
                title: routine.name.clone(),
                source: ChatSource::Routine,
            },
        ) else {
            continue;
        };
        let Ok(run) = runs::begin(&world.db, &routine.id, Some(&chat.id), scheduled) else {
            continue;
        };

        let runner = app.clone();
        let world = Arc::clone(&world);
        let request = TurnRequest {
            chat_id: chat.id.clone(),
            prompt: routine.instruction.clone(),
            permission: Some(routine.permission),
            occasion_routine: Some(routine.name.clone()),
            occasion_handoff: None,
            account_id: None,
        };
        std::thread::spawn(move || {
            let outcome = execute(&world, request, |_| {});
            let error = outcome.err();
            let _ = runs::finish(&world.db, &run.id, error.as_deref());
            let _ = runner.emit("routine-status", &run.routine_id);
        });
        let _ = app.emit("routine-status", &routine.id);
    }
}

/// The app-wide pause. Read from settings on every tick rather than cached, so
/// switching it off stops the next minute rather than the next launch.
fn paused(app: &AppHandle) -> bool {
    use tauri::Manager;
    app.try_state::<crate::state::AppState>()
        .map(|state| state.settings.lock().routines_paused)
        .unwrap_or(true)
}

/// A routine runs on its agent's engine. Falling back to Claude rather than
/// refusing: the chat is created either way and a wrong engine is a visible,
/// fixable error, while no chat at all is a routine that silently did nothing.
fn engine_for(world: &super::hub::AgentWorld, agent_id: &str) -> vibyra_core::agent_model::Engine {
    vibyra_core::agent_profiles::get(&world.db, &world.account, agent_id)
        .map(|profile| profile.engine)
        .unwrap_or(vibyra_core::agent_model::Engine::Claude)
}
