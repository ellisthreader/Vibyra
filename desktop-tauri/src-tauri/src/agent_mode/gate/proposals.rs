use super::context::Subject;
use crate::agent_mode::{
    bridge::wire::{BridgeReply, BridgeRequest},
    AgentWorld,
};
use serde_json::json;
use vibyra_core::{
    agent_memory::{MemoryClass, MemoryStatus, NewMemory},
    skills::{SkillDraft, SkillOrigin},
};

pub fn handle(world: &AgentWorld, subject: &Subject, request: &BridgeRequest) -> BridgeReply {
    match propose(world, subject, request) {
        Ok(id) => {
            world.changed(&request.chat_id);
            BridgeReply::allow(
                json!({"proposalId":id,"status":"proposed","message":"Saved for review. It is not active."}),
            )
        }
        Err(message) => BridgeReply::deny(message),
    }
}
fn propose(
    world: &AgentWorld,
    subject: &Subject,
    request: &BridgeRequest,
) -> Result<String, String> {
    let agent = subject
        .agent_id
        .as_deref()
        .ok_or("This chat has no teammate to teach.")?;
    let profile = vibyra_core::agent_profiles::get(&world.db, &world.account, agent)
        .map_err(|e| e.to_string())?;
    if profile.reflection == vibyra_core::agent_model::Reflection::Off {
        return Err("Learning is off for this teammate.".into());
    }
    if request.input.to_string().len() > 32_000 {
        return Err("A proposal must be at most 32,000 bytes.".into());
    }
    if !vibyra_core::agent_runs::reserve_proposal(&world.db, &world.account, &request.turn_id)
        .map_err(|e| e.to_string())?
    {
        return Err("This task has reached its three-proposal limit.".into());
    }
    let id = if request.tool_name == "propose_memory" {
        let body = request.input["body"]
            .as_str()
            .ok_or("A memory needs text.")?;
        let entry = vibyra_core::agent_memory::record(
            &world.db,
            agent,
            NewMemory {
                body: body.into(),
                class: MemoryClass::parse(request.input["class"].as_str().unwrap_or("fact")),
                priority: Some(60),
                source_chat: Some(request.chat_id.clone()),
                source_turn: Some(request.turn_id.clone()),
            },
            MemoryStatus::Proposed,
        )
        .map_err(|e| e.to_string())?;
        entry.id
    } else {
        let draft: SkillDraft =
            serde_json::from_value(request.input.clone()).map_err(|e| e.to_string())?;
        vibyra_core::skills::install(&world.db, &world.account, draft, SkillOrigin::Agent)
            .map_err(|e| e.to_string())?
            .id
    };
    vibyra_core::agent_runs::save_artifact(
        &world.db,
        &world.account,
        &request.turn_id,
        "proposal",
        "Learning proposal",
        &json!({"id":id,"tool":request.tool_name,"proposal":request.input,"status":"proposed"})
            .to_string(),
    )
    .map_err(|e| e.to_string())?;
    Ok(id)
}
