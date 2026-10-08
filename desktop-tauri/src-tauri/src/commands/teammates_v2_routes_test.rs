//! Teammate bridge allowlist tests: v1 paths, and Agent v2 client routes (docs/agent-v2-api-contract.md §5, §6b).
use super::{permitted, permitted_method};

#[test]
fn paths_are_method_scoped_and_cannot_escape_the_api() {
    assert!(permitted("agents/v1/teammates", false));
    assert!(permitted(
        "vibes/turns/123e4567-e89b-12d3-a456-426614174000",
        false
    ));
    for path in [
        "https://other.test",
        "agents/v1/teammates/../auth",
        "vibes/wallet?token=x",
        "vibes/purchases",
    ] {
        assert!(!permitted(path, true));
        assert!(!permitted(path, false));
    }
    let history = "vibes/chats/123e4567-e89b-12d3-a456-426614174000/turns?before=123e4567-e89b-12d3-a456-426614174001";
    assert!(permitted(history, false));
    assert!(!permitted(history, true));
    assert!(!permitted(&format!("{}&token=x", history), false));
    assert!(!permitted(
        "agents/v1/teammates?before=123e4567-e89b-12d3-a456-426614174001",
        false
    ));
    assert!(!permitted("vibes/consent", false));
    assert!(permitted("notifications/v1/inbox", false));
    assert!(!permitted("notifications/v1/inbox", true));
    assert!(!permitted("notifications/v1/devices", false));
    assert!(!permitted("vibes/models", true));
    assert!(permitted("connectors/google_calendar/start", true));
    assert!(permitted("connectors/google_drive/disconnect", true));
    assert!(!permitted("connectors/google-calendar/start", true));
    assert!(!permitted("connectors/google_calendar/../start", true));
}

#[test]
fn agent_v2_client_routes_are_exact() {
    let id = "123e4567-e89b-12d3-a456-426614174000";
    let reads = [
        "agents/v2/runtimes".to_string(),
        format!("agents/v2/runs?agentId={id}&limit=20"),
        format!("agents/v2/runs/{id}"),
        format!("agents/v2/runs/{id}/events?after=12&limit=200"),
    ];
    let writes = [
        "agents/v2/runs".to_string(),
        format!("agents/v2/runs/{id}/cancel"),
        format!("agents/v2/actions/{id}/decision"),
    ];
    assert!(reads
        .iter()
        .all(|p| permitted(p, false) && !permitted(p, true)));
    assert!(writes
        .iter()
        .all(|p| permitted(p, true) && !permitted(p, false)));
    for path in [
        format!("agents/v2/runs?agentId={id}"),
        format!("agents/v2/runs?agentId={id}&limit=20&token=x"),
        format!("agents/v2/runs/{id}/events?limit=5&after=1"),
        format!("agents/v2/runs/{id}/tools?after=1&limit=5"),
        format!("agents/v2/runner/{id}/claim"),
    ] {
        assert!(
            !permitted(&path, false) && !permitted(&path, true),
            "{path}"
        );
    }
}

#[test]
fn agent_v2_routine_and_trigger_routes_are_exact() {
    let id = "123e4567-e89b-12d3-a456-426614174000";
    let reads = [
        "agents/v2/capabilities".to_string(),
        // `connections` is also a POST (pasted token, §5): see teammates_v2_hub_routes.rs.
        format!("agents/v2/schedules?agentId={id}"),
        format!("agents/v2/schedules/{id}/occurrences?limit=20"),
        format!("agents/v2/triggers?agentId={id}"),
        format!("agents/v2/triggers/{id}/events?limit=20"),
    ];
    let writes = [
        "agents/v2/schedules".to_string(),
        "agents/v2/schedules/preview".to_string(),
        format!("agents/v2/schedules/{id}/pause"),
        "agents/v2/triggers".to_string(),
        format!("agents/v2/triggers/{id}/pause"),
    ];
    assert!(reads
        .iter()
        .all(|p| permitted(p, false) && !permitted(p, true)));
    assert!(writes
        .iter()
        .all(|p| permitted(p, true) && !permitted(p, false)));
    assert!(permitted_method(
        &format!("agents/v2/schedules/{id}"),
        "DELETE",
        false
    ));
    assert!(permitted_method(
        &format!("agents/v2/triggers/{id}"),
        "DELETE",
        false
    ));
    assert!(permitted_method(
        &format!("agents/v2/triggers/{id}"),
        "PATCH",
        true
    ));
    for (path, method, body) in [
        (format!("agents/v2/schedules/{id}"), "DELETE", true),
        (format!("agents/v2/triggers/{id}"), "PATCH", false),
        (format!("agents/v2/schedules/{id}"), "PATCH", true),
        ("agents/v2/schedules/preview".to_string(), "DELETE", false),
        (format!("agents/v2/triggers/{id}?x=1"), "DELETE", false),
        ("agents/v2/triggers/not-a-uuid".to_string(), "DELETE", false),
        (format!("agents/v2/runs/{id}"), "DELETE", false),
        (format!("agents/v2/triggers/{id}"), "PUT", true),
        (format!("agents/v1/teammates/{id}"), "PATCH", true),
    ] {
        assert!(!permitted_method(&path, method, body), "{method} {path}");
    }
    for path in [
        format!("agents/v2/schedules?agentId={id}&limit=5"),
        "agents/v2/schedules?agentId=abc".to_string(),
        "agents/v2/triggers?limit=5".to_string(),
        format!("agents/v2/schedules/{id}/occurrences?limit=1000"),
        format!("agents/v2/schedules/{id}/occurrences?limit=5&x=1"),
        format!("agents/v2/triggers/{id}/events?after=1&limit=5"),
        "agents/v2/triggers/not-a-uuid/events?limit=5".to_string(),
        format!("agents/v2/schedules/{id}"),
        format!("agents/v2/triggers/{id}"),
        "agents/v2/schedules/not-a-uuid/pause".to_string(),
        "agents/v2/capabilities?x=1".to_string(),
        format!("agents/v2/hooks/github/{id}"),
    ] {
        assert!(
            !permitted(&path, false) && !permitted(&path, true),
            "{path}"
        );
    }
}
