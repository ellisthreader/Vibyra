//! Overview route, device and error-suffix tests (docs/agent-v2-api-contract.md §6d).
use super::super::{permitted, permitted_method};
use super::*;

const ID: &str = "123e4567-e89b-12d3-a456-426614174000";

#[test]
fn overview_routes_are_exact() {
    let reads = [
        "agents/v2/roster".to_string(),
        "agents/v2/templates".to_string(),
        "agents/v2/activity?limit=30".to_string(),
        "agents/v2/activity?limit=30&provider=gmail".to_string(),
        format!("agents/v2/activity?limit=30&agentId={ID}"),
        format!("agents/v2/activity?limit=100&provider=google_calendar&agentId={ID}&cursor=MjAyNi0wOS0zMCAxMjowMDowMHwxMjM_-x"),
        "agents/v2/activity?limit=5&cursor=abc_DEF-123".to_string(),
        format!("agents/v2/activity?limit=5&cursor={}", "A".repeat(200)),
        format!("agents/v2/activity?limit=5&provider=a{}", "b".repeat(59)),
    ];
    let writes = [
        "agents/v2/runs/preview".to_string(),
        format!("agents/v2/agents/{ID}/read"),
        "agents/v2/templates/inbox_triage/teammates".to_string(),
        "agents/v2/templates/pr_shepherd/teammates".to_string(),
    ];
    for p in &reads {
        assert!(permitted(p, false) && !permitted(p, true), "{p}");
    }
    for p in &writes {
        assert!(permitted(p, true) && !permitted(p, false), "{p}");
    }
    for p in [
        "agents/v2/activity".to_string(),
        "agents/v2/activity?".to_string(),
        "agents/v2/activity?limit=".to_string(),
        "agents/v2/activity?limit=1000".to_string(),
        "agents/v2/activity?limit=x".to_string(),
        "agents/v2/activity?provider=gmail".to_string(),
        "agents/v2/activity?provider=gmail&limit=30".to_string(),
        "agents/v2/activity?limit=30&limit=30".to_string(),
        "agents/v2/activity?limit=30&provider=Gmail".to_string(),
        "agents/v2/activity?limit=30&provider=g".to_string(),
        "agents/v2/activity?limit=30&provider=gmail&provider=github".to_string(),
        "agents/v2/activity?limit=30&agentId=abc".to_string(),
        format!("agents/v2/activity?limit=30&cursor=abc&agentId={ID}"),
        "agents/v2/activity?limit=30&cursor=".to_string(),
        "agents/v2/activity?limit=30&cursor=a%2Fb".to_string(),
        "agents/v2/activity?limit=30&cursor=a=b".to_string(),
        format!("agents/v2/activity?limit=30&cursor={}", "a".repeat(201)),
        format!("agents/v2/activity?limit=30&provider=a{}", "b".repeat(60)),
        "agents/v2/activity?limit=30&token=x".to_string(),
        "agents/v2/activity?limit=30&".to_string(),
        "agents/v2/activity?limit=30&&cursor=a".to_string(),
        "agents/v2/activity/extra?limit=30".to_string(),
        "agents/v2/roster?x=1".to_string(),
        "agents/v2/templates?x=1".to_string(),
        "agents/v2/templates/inbox_triage".to_string(),
        "agents/v2/templates/Inbox/teammates".to_string(),
        "agents/v2/templates/i/teammates".to_string(),
        "agents/v2/templates/../teammates".to_string(),
        "agents/v2/templates/inbox_triage/teammates?x=1".to_string(),
        "agents/v2/runs/preview?x=1".to_string(),
        "agents/v2/runs/previews".to_string(),
        "agents/v2/agents/not-a-uuid/read".to_string(),
        format!("agents/v2/agents/{ID}/read?cursor=x"),
        format!("agents/v2/agents/{ID}/unread"),
        format!("agents/v2/agents/{ID}"),
    ] {
        assert!(!permitted(&p, false) && !permitted(&p, true), "{p}");
    }
    for p in reads.iter().chain(writes.iter()) {
        for verb in ["PATCH", "PUT", "DELETE"] {
            for body in [true, false] {
                assert!(!permitted_method(p, verb, body), "{verb} {p}");
            }
        }
    }
}

#[test]
fn a_device_rides_only_the_roster_and_read_routes() {
    assert!(takes_device("agents/v2/roster", false));
    assert!(!takes_device("agents/v2/roster", true));
    assert!(takes_device(&format!("agents/v2/agents/{ID}/read"), true));
    assert!(!takes_device(&format!("agents/v2/agents/{ID}/read"), false));
    for p in [
        "agents/v2/templates",
        "agents/v2/runs/preview",
        "agents/v2/activity?limit=30",
        "agents/v1/teammates",
        "agents/v2/runs",
    ] {
        assert!(!takes_device(p, true) && !takes_device(p, false), "{p}");
    }
    for ok in ["mac-123e4567-e89b", "a", "A.b_c:d-e", &"x".repeat(64)] {
        assert!(valid_device(ok), "{ok}");
    }
    for bad in ["", "a b", "a/b", "a\nb", "é", "a;b", "a,b", &"x".repeat(65)] {
        assert!(!valid_device(bad), "{bad:?}");
    }
}

#[test]
fn a_refusal_carries_its_code_and_fix_behind_the_words() {
    let body = json!({ "ok": false, "code": "runtime_required", "error": "words",
        "fix": { "action": "choose_ai_account", "message": "  Open Vibyra on your Mac.  " } });
    let suffix = error_suffix("agents/v2/runs", &body);
    assert!(suffix.starts_with('\u{1e}'));
    let meta: Value = serde_json::from_str(&suffix['\u{1e}'.len_utf8()..]).unwrap();
    assert_eq!(meta["code"], "runtime_required");
    assert_eq!(meta["fix"]["action"], "choose_ai_account");
    assert_eq!(meta["fix"]["message"], "Open Vibyra on your Mac.");
    assert_eq!(
        suffix,
        "\u{1e}{\"code\":\"runtime_required\",\"fix\":{\"action\":\"choose_ai_account\",\"message\":\"Open Vibyra on your Mac.\"}}"
    );
    // Not a v2 path, nothing structured, or malformed pieces: nothing is appended.
    assert_eq!(error_suffix("agents/v1/teammates", &body), "");
    assert_eq!(error_suffix("agents/v2/runs", &json!({ "error": "x" })), "");
    assert_eq!(
        error_suffix("agents/v2/runs", &json!({ "code": "Not Valid!" })),
        ""
    );
    assert_eq!(error_suffix("agents/v2/runs", &json!({ "code": 409 })), "");
    let half = error_suffix(
        "agents/v2/runs",
        &json!({ "code": "stale_cursor", "fix": { "action": "x" } }),
    );
    assert_eq!(half, "\u{1e}{\"code\":\"stale_cursor\",\"fix\":null}");
    let long = json!({ "fix": { "action": "choose_ai_account", "message": "m".repeat(900) } });
    let meta: Value =
        serde_json::from_str(&error_suffix("agents/v2/runs", &long)['\u{1e}'.len_utf8()..])
            .unwrap();
    assert_eq!(meta["fix"]["message"].as_str().unwrap().len(), 300);
    assert!(meta["code"].is_null());
}
