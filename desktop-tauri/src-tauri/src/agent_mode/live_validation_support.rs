use super::*;
use std::{io::Write, path::Path};
pub fn revoke(
    world: &super::super::AgentWorld,
    card: &vibyra_core::approvals::ApprovalRequest,
) -> Value {
    let agent = card.agent_id.as_deref().unwrap();
    let mut revoked = Vec::new();
    world
        .change_agent(agent, true, || {
            for place in agent_profiles::list_places(&world.db, agent).map_err(|e| e.to_string())? {
                if place.label != "Agent home" && place.access == PlaceAccess::ReadWrite {
                    agent_profiles::revoke_place(&world.db, agent, &place.id)
                        .map_err(|e| e.to_string())?;
                    revoked.push(place.path);
                }
            }
            Ok(())
        })
        .unwrap();
    assert!(!revoked.is_empty());
    json!({"revoked":revoked,"remainingPlaces":agent_profiles::list_places(&world.db, agent).unwrap()})
}
pub fn append(path: &Path, value: &Value) {
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    writeln!(file, "{value}").unwrap();
}
pub fn snapshot(world: &super::super::AgentWorld, path: &Path, summary: Value) {
    let runs = agent_runs::list(&world.db, &world.account, None).unwrap();
    let records: Vec<_> = runs
        .iter()
        .map(|run| {
            json!({
                "run":run,
                "artifacts":agent_runs::artifact_list(&world.db, &world.account, &run.id).unwrap(),
                "transcript":agent_chats::transcript::all(&world.db, &run.chat_id).unwrap(),
            })
        })
        .collect();
    fs::write(
        path,
        serde_json::to_vec_pretty(&json!({"summary":summary,"records":records})).unwrap(),
    )
    .unwrap();
}
