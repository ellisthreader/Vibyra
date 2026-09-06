use crate::agent_mode::hub::{AgentHub, AgentWorld};
use std::sync::Arc;
use vibyra_core::agent_model::{Engine, PermissionMode};
pub(crate) fn world(tmp: &tempfile::TempDir) -> (Arc<AgentWorld>, String) {
    let hub = AgentHub::default();
    let world = hub.world("acct", tmp.path()).unwrap();
    let profile = vibyra_core::agent_profiles::create(
        &world.db,
        &world.account,
        &world.root,
        vibyra_core::agent_profiles::NewAgent {
            name: "Nia".into(),
            brief: String::new(),
            engine: Engine::Claude,
        },
    )
    .unwrap();
    // A teammate is created at the safe default; these cases are about what an
    // agent that *may* write proposes, so it is widened here rather than in
    // the fixture, where it would read as the default.
    let profile = vibyra_core::agent_profiles::update(
        &world.db,
        &world.account,
        &profile.id,
        vibyra_core::agent_profiles::AgentUpdate {
            permission: Some(PermissionMode::Standard),
            ..Default::default()
        },
    )
    .unwrap();
    let chat = vibyra_core::agent_chats::create(
        &world.db,
        &world.account,
        vibyra_core::agent_chats::NewChat {
            agent_id: Some(profile.id.clone()),
            engine: Engine::Claude,
            title: String::new(),
            source: vibyra_core::agent_model::ChatSource::User,
        },
    )
    .unwrap();
    // A question only ever arrives while its turn is running, and the gate
    // relies on that: a card whose turn has already gone is abandoned rather
    // than left parking a provider process. Registering the handle is what
    // makes this fixture the situation the gate is actually asked about.
    world.begin(&chat.id).unwrap();
    let places = vibyra_core::agent_profiles::list_places(&world.db, &profile.id).unwrap();
    vibyra_core::agent_runs::begin(
        &world.db,
        &format!("turn-{}", chat.id),
        &world.account,
        &chat.id,
        Some(&profile.id),
        vibyra_core::agent_runs::RunSpec {
            agent_name: profile.name,
            engine: profile.engine,
            model: None,
            effort: None,
            account_id: None,
            permission: profile.permission,
            cwd: profile.home_path,
            places,
            prompt: "Test".into(),
            context: String::new(),
            context_fingerprint: String::new(),
            provider_version: "fixture".into(),
            timeout_ms: 1000,
            max_tool_calls: 10,
        },
    )
    .unwrap();
    (world, chat.id)
}
