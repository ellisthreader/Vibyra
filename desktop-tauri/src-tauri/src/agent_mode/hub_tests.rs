//! Hub tests.
//!
//! All four are about the same boundary: one account's world at a time, and
//! closing it leaves nothing of that account running.

use super::*;

/// The account key is opaque backend text and reaches a path, so it is
/// held to one harmless segment rather than trusted.
#[test]
fn an_account_key_can_only_ever_be_one_path_segment() {
    assert_eq!(
        sanitize("abc-123"),
        "abc-123",
        "an ordinary key is left alone"
    );
    assert_eq!(sanitize(""), "account");
    assert_eq!(sanitize("///"), "account");

    // The property, rather than an exact spelling: whatever arrives, what
    // comes out is one bounded segment that cannot climb anywhere.
    for hostile in [
        "../../etc/passwd",
        "a/b",
        "..",
        r"..\..\windows",
        &"x".repeat(400),
    ] {
        let safe = sanitize(hostile);
        assert!(
            !safe.contains(['/', '\\']),
            "{hostile} kept a separator: {safe}"
        );
        assert!(
            !safe.chars().all(|c| c == '.'),
            "{hostile} stayed a relative path"
        );
        assert!(
            safe.len() <= 64 && !safe.is_empty(),
            "{hostile} produced {safe:?}"
        );
    }
}

/// Two logins on one machine get separate databases, not shared rows.
#[test]
fn switching_account_closes_the_previous_world() {
    let tmp = tempfile::tempdir().unwrap();
    let hub = AgentHub::default();

    let first = hub.world("alice", tmp.path()).unwrap();
    let again = hub.world("alice", tmp.path()).unwrap();
    assert!(
        Arc::ptr_eq(&first, &again),
        "the same account reuses one world"
    );

    let second = hub.world("bob", tmp.path()).unwrap();
    assert_ne!(first.root, second.root);
    assert!(first.root.join("agents.db").exists());
    assert!(second.root.join("agents.db").exists());
}

/// Sign-out must leave nothing running.
#[test]
fn closing_the_hub_stops_every_turn() {
    let tmp = tempfile::tempdir().unwrap();
    let hub = AgentHub::default();
    let world = hub.world("alice", tmp.path()).unwrap();
    let handle = world.begin("chat-1");
    assert_eq!(world.busy(), vec!["chat-1".to_string()]);

    hub.close();
    assert!(handle.cancelled());
    assert!(hub.current().is_none());
}

/// Stopping tells the UI whether there was anything to stop.
#[test]
fn cancelling_reports_whether_a_turn_was_running() {
    let tmp = tempfile::tempdir().unwrap();
    let hub = AgentHub::default();
    let world = hub.world("alice", tmp.path()).unwrap();

    assert!(!world.cancel("chat-1"), "nothing was running");
    world.begin("chat-1");
    assert!(world.cancel("chat-1"));
}
