use crate::agent_mode::AgentWorld;
#[cfg(test)]
#[path = "agent_handoff_receipt_tests.rs"]
mod tests;
use vibyra_core::agent_runs::{self, RunOutcome, RunStatus};

pub(super) fn record(
    world: &AgentWorld,
    mail: &str,
    chat: &str,
    link: Option<(Option<String>, String)>,
    result: Result<RunOutcome, String>,
) -> Result<(), String> {
    let outcome = result.unwrap_or_else(|error| RunOutcome {
        status: RunStatus::Failed,
        message: Some(error),
    });
    vibyra_core::agent_mail::set_status(&world.db, mail, outcome.status.as_str())
        .map_err(|e| e.to_string())?;
    let child = agent_runs::list(&world.db, &world.account, Some(chat))
        .map_err(|e| e.to_string())?
        .into_iter()
        .next();
    let parent = link.as_ref().and_then(|(parent, _)| parent.as_deref());
    let receipt = serde_json::json!({
        "mailId":mail, "parentRunId":parent, "childRunId":child.as_ref().map(|run| &run.id),
        "childChatId":chat, "expectedOutput":link.as_ref().map(|(_, expected)| expected),
        "outcome":outcome, "verification":"Provider outcome recorded; review saved outputs against the requested criteria."
    }).to_string();
    for id in parent
        .into_iter()
        .chain(child.as_ref().map(|run| run.id.as_str()))
    {
        agent_runs::save_artifact(
            &world.db,
            &world.account,
            id,
            "handoff",
            "Handoff outcome",
            &receipt,
        )
        .map_err(|e| e.to_string())?;
    }
    world.changed(chat);
    Ok(())
}
