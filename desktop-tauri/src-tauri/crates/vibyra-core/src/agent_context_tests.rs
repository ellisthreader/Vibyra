use super::*;
use crate::agent_memory::{MemoryClass, MemoryStatus};
use crate::agent_model::{Engine, PlaceAccess, Reflection};

fn profile() -> AgentProfile {
    AgentProfile {
        id: "a".into(),
        account: "acct".into(),
        name: "Nia".into(),
        brief: "You keep the release notes honest.".into(),
        engine: Engine::Claude,
        model: None,
        effort: None,
        permission: PermissionMode::Standard,
        memory_budget: 4_000,
        reflection: Reflection::Suggest,
        home_path: "/home/u/.vibyra/agents/a".into(),
        accent: String::new(),
        mail_enabled: false,
        routines_allowed: true,
        created_ms: 0,
        updated_ms: 0,
        archived_ms: None,
    }
}

fn place(path: &str, access: PlaceAccess) -> AgentPlace {
    AgentPlace {
        id: "p".into(),
        agent_id: "a".into(),
        path: path.into(),
        access,
        label: String::new(),
        created_ms: 0,
    }
}

fn memory(body: &str) -> MemoryEntry {
    MemoryEntry {
        id: "m".into(),
        agent_id: "a".into(),
        class: MemoryClass::Constraint,
        body: body.into(),
        priority: 50,
        pinned: false,
        status: MemoryStatus::Active,
        source_chat: None,
        source_turn: None,
        created_ms: 0,
        updated_ms: 0,
    }
}

fn skill(name: &str, trigger: &str) -> Skill {
    Skill {
        id: "s".into(),
        account: "acct".into(),
        name: name.into(),
        summary: "Does a thing".into(),
        version: 1,
        trigger: trigger.into(),
        procedure: "THE FULL PROCEDURE".into(),
        verification: "It worked".into(),
        boundary: "Anything outward".into(),
        origin: crate::skills::SkillOrigin::User,
        status: "installed".into(),
        created_ms: 0,
        updated_ms: 0,
    }
}

fn build(prompt: &str, skills: &[Skill], permission: PermissionMode) -> AssembledContext {
    assemble(
        &profile(),
        &[memory("Never force-push the release branch.")],
        skills,
        &[place("/w/project", PlaceAccess::ReadWrite)],
        permission,
        Occasion::Direct,
        prompt,
    )
}

/// Same inputs, same text, same digest — the property that makes "what did
/// it know" answerable without rerunning anything.
#[test]
fn the_same_inputs_always_produce_the_same_context() {
    let first = build("ship the release", &[], PermissionMode::Standard);
    let second = build("ship the release", &[], PermissionMode::Standard);
    assert_eq!(first.text, second.text);
    assert_eq!(first.fingerprint, second.fingerprint);
}

/// And a changed grant is visible in the digest, which is what makes a
/// stale context explainable rather than mysterious.
#[test]
fn a_changed_permission_moves_the_fingerprint() {
    let standard = build("ship it", &[], PermissionMode::Standard);
    let plan = build("ship it", &[], PermissionMode::Plan);
    assert_ne!(standard.fingerprint, plan.fingerprint);
    assert!(plan.text.contains("Read and plan only"));
    assert!(!plan.text.contains("may read and write inside"));
}

/// Every skill costs a headline; only a matching one costs its procedure.
#[test]
fn only_a_matching_skill_expands_its_procedure() {
    let skills = [
        skill("Release notes", "writing release notes for a version"),
        skill("Database work", "migrating a postgres schema"),
    ];
    let context = build(
        "write the release notes please",
        &skills,
        PermissionMode::Standard,
    );

    assert!(context.text.contains("Release notes"));
    assert!(
        context.text.contains("Database work"),
        "headlines are always listed"
    );
    assert_eq!(
        context.text.matches("THE FULL PROCEDURE").count(),
        1,
        "only the matching skill should have expanded"
    );
}
