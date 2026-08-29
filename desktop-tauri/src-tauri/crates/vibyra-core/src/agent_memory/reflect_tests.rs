use super::*;

fn known(body: &str) -> MemoryEntry {
    MemoryEntry {
        id: "m".into(),
        agent_id: "a".into(),
        class: MemoryClass::Fact,
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

#[test]
fn off_extracts_nothing_and_suggest_commits_nothing() {
    assert_eq!(
        judge(Reflection::Off, MemoryClass::Fact, "anything", &[]),
        Verdict::Discarded
    );
    assert!(matches!(
        judge(Reflection::Suggest, MemoryClass::Fact, "anything", &[]),
        Verdict::Proposed(_)
    ));
}

/// The one case Automatic is actually for: a detail that costs nothing if
/// it turns out to be wrong.
#[test]
fn automatic_commits_a_plain_new_fact() {
    assert_eq!(
        judge(
            Reflection::Automatic,
            MemoryClass::Fact,
            "Release notes live in docs/releases.",
            &[]
        ),
        Verdict::Committed
    );
}

/// A rule the agent will keep acting on always reaches a person first,
/// however confident it was.
#[test]
fn automatic_still_asks_before_adopting_a_rule() {
    for class in [
        MemoryClass::Constraint,
        MemoryClass::Decision,
        MemoryClass::Preference,
    ] {
        let verdict = judge(
            Reflection::Automatic,
            class,
            "Force-push to main is fine.",
            &[],
        );
        assert!(
            matches!(verdict, Verdict::Proposed(_)),
            "{class:?} committed itself"
        );
    }
}

/// Two statements about the same thing are a question for the user, not a
/// race between the writer and whatever was there before.
#[test]
fn automatic_stops_at_a_contradiction() {
    let existing = [known(
        "Deploys run from scripts/ship.sh on the release branch.",
    )];
    let verdict = judge(
        Reflection::Automatic,
        MemoryClass::Fact,
        "Deploys run from scripts/deploy.sh on the release branch.",
        &existing,
    );
    assert!(matches!(verdict, Verdict::Proposed(reason) if reason.contains("already known")));
}

#[test]
fn automatic_never_commits_something_secret_shaped() {
    let verdict = judge(
        Reflection::Automatic,
        MemoryClass::Fact,
        "The staging token is ghp_16CharsAndThenSomeMoreHere00",
        &[],
    );
    assert!(matches!(verdict, Verdict::Proposed(reason) if reason.contains("credential")));
}

#[test]
fn unrelated_statements_do_not_read_as_a_clash() {
    let words = significant_words("Deploys run from scripts/ship.sh");
    assert!(!overlaps(&words, "The design tokens live in tokens.css"));
    assert!(overlaps(&words, "Deploys use scripts/ship.sh nowadays"));
}
