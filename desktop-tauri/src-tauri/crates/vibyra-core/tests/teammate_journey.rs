//! Scratch-database lifecycle always runs. Real providers are explicitly opt-in.
use serde_json::json;
use vibyra_core::agent_model::{Engine, PermissionMode, PlaceAccess};
use vibyra_core::agent_runtime::{
    adapter::TurnPlan, normalize, run, AgentEvent, TurnExit, TurnHandle,
};
use vibyra_core::agentdb::{ids::new_id, AgentDb};
use vibyra_core::{agent_context, agent_memory, agent_profiles, routines, skills};

fn seed(root: &std::path::Path, engine: Engine) -> String {
    let db = AgentDb::open(&root.join("agents.db")).unwrap();
    let profile = agent_profiles::create_once(&db, "journey", root, serde_json::from_value(json!({
        "name":"Context verifier", "brief":"For a context check include BRIEF-READY.", "engine":engine
    })).unwrap(), Some(&new_id())).unwrap();
    agent_memory::record_once(
        &db,
        &profile.id,
        serde_json::from_value(json!({
            "class":"fact", "body":"The memory marker for a context check is MEMORY-READY."
        }))
        .unwrap(),
        agent_memory::MemoryStatus::Active,
        Some(&new_id()),
    )
    .unwrap();
    let skill = skills::install_once(&db, "journey", serde_json::from_value(json!({
        "name":"Context check", "trigger":"context check", "procedure":"For a context check include SKILL-READY.",
        "verification":"All three markers appear", "boundary":"Do not use tools or change files"
    })).unwrap(), skills::SkillOrigin::User, Some(&new_id())).unwrap();
    skills::assign(&db, &profile.id, &skill.id, true).unwrap();
    let folder = root.join("explicit-read-only-project");
    std::fs::create_dir(&folder).unwrap();
    agent_profiles::grant_place(
        &db,
        &profile.id,
        folder.to_str().unwrap(),
        PlaceAccess::Read,
    )
    .unwrap();
    routines::create_once(&db, serde_json::from_value(json!({
        "agentId":profile.id, "name":"Context check", "instruction":"Perform a context check without tools",
        "schedule":{"kind":"every","minutes":60}, "timezone":"UTC", "permission":"plan"
    })).unwrap(), Some(&new_id())).unwrap();
    profile.id
}
fn context(db: &AgentDb, id: &str) -> (agent_profiles::AgentProfile, String) {
    let profile = agent_profiles::get(db, "journey", id).unwrap();
    let memory = agent_memory::list(db, id).unwrap();
    let assigned = skills::assigned(db, "journey", id).unwrap();
    let places = agent_profiles::list_places(db, id).unwrap();
    assert_eq!(memory.len(), 1);
    assert_eq!(assigned.len(), 1);
    assert_eq!(places.len(), 2);
    let assembled = agent_context::assemble(
        &profile,
        &memory,
        &assigned,
        &places,
        PermissionMode::Plan,
        agent_context::Occasion::Direct,
        "Perform a context check",
    );
    for marker in ["BRIEF-READY", "MEMORY-READY", "SKILL-READY"] {
        assert!(assembled.text.contains(marker));
    }
    assert_eq!(assembled.applied.len(), 1);
    assert!(routines::list(db, Some(id)).unwrap()[0]
        .next_run_ms
        .is_some());
    (profile, assembled.text)
}
#[test]
fn saved_teammate_is_useful_after_database_reopen() {
    let root = tempfile::tempdir().unwrap();
    let id = seed(root.path(), Engine::Claude);
    let db = AgentDb::open(&root.path().join("agents.db")).unwrap();
    let (_, assembled) = context(&db, &id);
    assert!(assembled.contains("explicit-read-only-project"));
}
#[test]
fn real_providers_use_saved_brief_memory_and_skill_in_fresh_sessions() {
    if std::env::var("VIBYRA_LIVE_TEAMMATE_TESTS").as_deref() != Ok("1") {
        eprintln!("Not run: VIBYRA_LIVE_TEAMMATE_TESTS=1 enables real-provider requests.");
        return;
    }
    for engine in [Engine::Claude, Engine::Codex] {
        let root = tempfile::tempdir().unwrap();
        let id = seed(root.path(), engine);
        for _ in 0..2 {
            let db = AgentDb::open(&root.path().join("agents.db")).unwrap();
            let (profile, preamble) = context(&db, &id);
            let plan = TurnPlan { engine, session: None, permission: PermissionMode::Plan,
                cwd: profile.home_path, places: Vec::new(), model: None, effort: None, images: Vec::new(),
                prompt: "Perform a context check. Reply only with the three markers specified in your brief, memory and matching skill. Do not use tools.".into(),
                system_prompt: Some(preamble), env: Vec::new(), env_remove: Vec::new(), bridge: None,
            }.build();
            let handle = std::sync::Arc::new(TurnHandle::new());
            let cancel = handle.clone();
            let (done, wait) = std::sync::mpsc::channel::<()>();
            let timeout = std::thread::spawn(move || {
                if wait
                    .recv_timeout(std::time::Duration::from_secs(120))
                    .is_err()
                {
                    cancel.cancel();
                }
            });
            let mut answer = String::new();
            let outcome = run(plan.command, &handle, |line| {
                for event in normalize(engine, line) {
                    if let AgentEvent::AssistantCompleted { text } = event {
                        answer.push_str(&text);
                    }
                }
            });
            let _ = done.send(());
            timeout.join().unwrap();
            assert_eq!(
                outcome.unwrap(),
                TurnExit::Completed,
                "{} did not complete",
                engine.as_str()
            );
            for marker in ["BRIEF-READY", "MEMORY-READY", "SKILL-READY"] {
                assert!(
                    answer.contains(marker),
                    "{} did not return expected context marker {marker}",
                    engine.as_str()
                );
            }
        }
        eprintln!(
            "Verified {}: persisted brief, memory and skill across two fresh sessions",
            engine.as_str()
        );
    }
}
