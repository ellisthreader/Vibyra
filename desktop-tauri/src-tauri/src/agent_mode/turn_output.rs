use super::turn_execute::Execution;
use vibyra_core::agent_runs::{RunOutcome, RunStatus};

pub(super) fn save(
    execution: &Execution<'_>,
    outcome: &RunOutcome,
    answer: &str,
) -> Result<(), String> {
    let Execution {
        world, chat, task, ..
    } = execution;
    if !answer.trim().is_empty() {
        vibyra_core::agent_runs::save_artifact(
            &world.db,
            &world.account,
            &task.id,
            "answer",
            if outcome.status == RunStatus::Succeeded {
                "Task response"
            } else {
                "Partial task response"
            },
            answer,
        )
        .map_err(|e| e.to_string())?;
    }
    if outcome.status == RunStatus::Succeeded {
        if let Some(id) = &chat.agent_id {
            let profile = vibyra_core::agent_profiles::get(&world.db, &world.account, id)
                .map_err(|e| e.to_string())?;
            super::reflect::after_turn(&world.db, &profile, &chat.id, &task.id, answer)?;
        }
    }
    Ok(())
}
