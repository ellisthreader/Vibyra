use super::*;
use crate::agentdb::AgentDb;

fn draft(name: &str, procedure: &str) -> SkillDraft {
    SkillDraft {
        name: name.into(),
        summary: "Does a thing".into(),
        trigger: "When the thing needs doing".into(),
        procedure: procedure.into(),
        verification: "The thing is done".into(),
        boundary: "Anything outward-facing".into(),
    }
}

fn seeded() -> AgentDb {
    let db = AgentDb::open_memory().unwrap();
    db.with(|connection| {
        connection
            .execute(
                "INSERT INTO agent_profiles \
                 (id, account, name, engine, home_path, created_ms, updated_ms) \
                 VALUES ('a', 'acct', 'Nia', 'claude', '/tmp/a', 1, 1)",
                [],
            )
            .unwrap();
        Ok(())
    })
    .unwrap();
    db
}

/// The boundary the module exists for: an agent proposes, a person installs.
/// A proposal is stored so it can be read, and never reaches a turn.
#[test]
fn an_agent_can_propose_a_skill_but_not_install_one() {
    let db = seeded();
    let proposed = install(
        &db,
        "acct",
        draft("Ship notes", "Write them"),
        SkillOrigin::Agent,
    )
    .unwrap();
    assert_eq!(proposed.status, "proposed");

    assign(&db, "a", &proposed.id, true).unwrap();
    assert!(
        assigned(&db, "acct", "a").unwrap().is_empty(),
        "a proposal must not reach a turn even once assigned"
    );

    set_status(&db, "acct", &proposed.id, "installed").unwrap();
    assert_eq!(assigned(&db, "acct", "a").unwrap().len(), 1);
}

/// A user-written skill is installed immediately — the approval is already the
/// act of writing it.
#[test]
fn a_user_written_skill_is_installed_at_once() {
    let db = seeded();
    let skill = install(&db, "acct", draft("Mine", "Do it"), SkillOrigin::User).unwrap();
    assert_eq!(skill.status, "installed");
    assert_eq!(skill.version, 1);
}

/// Editing keeps the old text, so a bad edit is a rollback rather than a loss,
/// and an audit record naming version 1 can still be read.
#[test]
fn revising_keeps_every_earlier_version() {
    let db = seeded();
    let skill = install(&db, "acct", draft("Release", "Step one"), SkillOrigin::User).unwrap();
    let second = revise(
        &db,
        "acct",
        &skill.id,
        draft("Release", "Step one, then two"),
    )
    .unwrap();

    assert_eq!(second.version, 2);
    let versions = history(&db, &skill.id).unwrap();
    assert!(versions
        .iter()
        .any(|entry| entry.version == 1 && entry.procedure == "Step one"));

    let rolled = roll_back(&db, "acct", &skill.id, 1).unwrap();
    assert_eq!(rolled.procedure, "Step one");
    assert_eq!(
        rolled.version, 3,
        "a rollback is itself an edit, not a rewrite of history"
    );
}

/// A skill is injected into every matching turn, which makes it the worst
/// possible place for a credential.
#[test]
fn a_skill_carrying_a_credential_is_refused() {
    let db = seeded();
    let bad = install(
        &db,
        "acct",
        draft(
            "Deploy",
            "Run: curl -H 'Authorization: Bearer ghp_16CharsAndThenSomeMoreHere00'",
        ),
        SkillOrigin::User,
    );
    assert!(bad.is_err());
}

/// A skill without a procedure is a name, and would inject nothing useful.
#[test]
fn a_skill_needs_a_name_and_a_procedure() {
    let db = seeded();
    assert!(install(&db, "acct", draft("", "something"), SkillOrigin::User).is_err());
    assert!(install(&db, "acct", draft("Named", "  "), SkillOrigin::User).is_err());
}

/// Every turn gets the one-line headline; only a matching skill costs its full
/// procedure. Injecting six procedures into every prompt is how a budget goes
/// on instructions nobody needed.
#[test]
fn the_headline_is_cheap_and_the_procedure_is_not() {
    let db = seeded();
    let skill = install(&db, "acct", draft("Release", "Step one"), SkillOrigin::User).unwrap();

    assert!(skill.headline().contains("Release"));
    assert!(skill.headline().contains("use when:"));
    assert!(
        !skill.headline().contains("Step one"),
        "the headline must stay a headline"
    );
    assert!(skill.expanded().contains("Step one"));
    assert!(skill.expanded().contains("Stop and ask before:"));
}

/// Unassigning takes a skill back without deleting it.
#[test]
fn a_skill_can_be_taken_back_from_an_agent() {
    let db = seeded();
    let skill = install(&db, "acct", draft("Release", "Step one"), SkillOrigin::User).unwrap();
    assign(&db, "a", &skill.id, true).unwrap();
    assert_eq!(assigned(&db, "acct", "a").unwrap().len(), 1);

    assign(&db, "a", &skill.id, false).unwrap();
    assert!(assigned(&db, "acct", "a").unwrap().is_empty());
    assert_eq!(list(&db, "acct").unwrap().len(), 1, "still in the library");
}

/// The starters exist to show a shape worth copying, so each one has to have
/// that shape.
#[test]
fn every_starter_skill_has_the_shape_it_is_teaching() {
    let all = starters();
    assert!(
        all.len() <= 4,
        "a long starter list teaches that skills are decoration"
    );
    for skill in all {
        assert!(
            !skill.trigger.trim().is_empty(),
            "{} has no trigger",
            skill.name
        );
        assert!(
            !skill.verification.trim().is_empty(),
            "{} has no verification",
            skill.name
        );
        assert!(
            !skill.boundary.trim().is_empty(),
            "{} has no stop boundary",
            skill.name
        );
    }
}
