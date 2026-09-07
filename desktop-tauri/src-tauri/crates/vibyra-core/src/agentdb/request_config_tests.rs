use super::AgentDb;
use crate::{agent_profiles, routines, skills};
use serde_json::json;

#[test]
fn routine_and_skill_saves_are_once_per_token_including_revisions() {
    let root = tempfile::tempdir().unwrap();
    let db = AgentDb::open_memory().unwrap();
    let agent = agent_profiles::create(
        &db,
        "account",
        root.path(),
        serde_json::from_value(json!({"name":"Audit", "engine":"claude"})).unwrap(),
    )
    .unwrap();
    let token = super::ids::new_id();
    let draft = || {
        serde_json::from_value(
            json!({"agentId":agent.id,"name":"Audit","instruction":"Read only",
        "schedule":{"kind":"every","minutes":60},"timezone":"UTC"}),
        )
        .unwrap()
    };
    let routine = routines::create_once(&db, draft(), Some(&token)).unwrap();
    assert_eq!(
        routines::create_once(&db, draft(), Some(&token))
            .unwrap()
            .id,
        routine.id
    );
    assert_eq!(routines::list(&db, None).unwrap().len(), 1);
    let edit_token = super::ids::new_id();
    let updated = routines::update_once(&db, &routine.id, draft(), Some(&edit_token)).unwrap();
    assert_eq!(
        routines::update_once(&db, &routine.id, draft(), Some(&edit_token))
            .unwrap()
            .next_run_ms,
        updated.next_run_ms
    );
    routines::set_enabled(&db, &routine.id, false).unwrap();
    let paused =
        routines::update_once(&db, &routine.id, draft(), Some(&super::ids::new_id())).unwrap();
    assert!(!paused.enabled);
    assert!(!routines::get(&db, &routine.id).unwrap().enabled);
    let another = agent_profiles::create(
        &db,
        "account",
        root.path(),
        serde_json::from_value(json!({"name":"Another", "engine":"claude"})).unwrap(),
    )
    .unwrap();
    let mut moved = draft();
    moved.agent_id = another.id.clone();
    let moved =
        routines::update_once(&db, &routine.id, moved, Some(&super::ids::new_id())).unwrap();
    assert_eq!(moved.agent_id, another.id);
    assert_eq!(
        routines::get(&db, &routine.id).unwrap().agent_id,
        another.id
    );
    let skill_token = super::ids::new_id();
    let skill_draft = || {
        serde_json::from_value(
            json!({"name":"Proof","trigger":"After a change","procedure":"Read the result"}),
        )
        .unwrap()
    };
    let skill = skills::install_once(
        &db,
        "account",
        skill_draft(),
        skills::SkillOrigin::User,
        Some(&skill_token),
    )
    .unwrap();
    assert_eq!(
        skills::install_once(
            &db,
            "account",
            skill_draft(),
            skills::SkillOrigin::User,
            Some(&skill_token)
        )
        .unwrap()
        .id,
        skill.id
    );
    let revision = super::ids::new_id();
    assert_eq!(
        skills::revise_once(&db, "account", &skill.id, skill_draft(), Some(&revision))
            .unwrap()
            .version,
        2
    );
    assert_eq!(
        skills::revise_once(&db, "account", &skill.id, skill_draft(), Some(&revision))
            .unwrap()
            .version,
        2
    );
    assert_eq!(skills::list(&db, "account").unwrap().len(), 1);
}
