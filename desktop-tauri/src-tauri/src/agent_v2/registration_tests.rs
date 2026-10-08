use super::*;
use crate::agent_v2::mock_http::MockServer;

fn selection(provider: &str) -> Selection {
    Selection {
        provider: provider.into(),
        account: "default".into(),
        model: "sonnet".into(),
        effort: None,
    }
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

#[test]
fn claude_advertises_controlled_tools_and_others_do_not() {
    let host = "a".repeat(64);
    let claude = payload(&host, &selection("claude"), "2.1.285");
    assert_eq!(claude["capabilities"]["controlledTools"], true);
    assert_eq!(claude["capabilities"]["pinnedSkillsV1"], true);
    assert_eq!(claude["providerVersion"], "2.1.285");
    assert_eq!(claude["accountRef"], "default");
    for other in ["codex", "gemini"] {
        let body = payload(&host, &selection(other), "");
        assert_eq!(body["capabilities"]["controlledTools"], false);
        assert_eq!(body["capabilities"]["ready"], false);
        assert_ne!(body["capabilities"]["pinnedSkillsV1"], true);
        assert!(body["providerVersion"].is_null());
    }
    // Never any login material in the registration.
    let text = claude.to_string().to_ascii_lowercase();
    for secret in ["token", "apikey", "api_key", "password", "oauth"] {
        assert!(!text.contains(secret), "{secret}");
    }
}

#[test]
fn registration_reads_the_one_time_runner_key() {
    let id = "33333333-3333-4333-8333-333333333333";
    let key = "k".repeat(64);
    let reply = json!({"runtime": {"id": id, "runnerKey": key, "revision": 2}}).to_string();
    let server = MockServer::start(move |_| (201, reply.clone()));
    let body = payload(&"a".repeat(64), &selection("claude"), "2.1.285");
    let (got_id, got_key) = runtime()
        .block_on(register(&server.base, "session", body))
        .unwrap();
    assert_eq!((got_id.as_str(), got_key.as_str()), (id, key.as_str()));
    let request = &server.requests.lock().unwrap()[0];
    assert_eq!(request.path, "/api/agents/v2/runtimes");
    assert!(request.runner_key.is_none());
    assert_eq!(request.body["capabilities"]["controlledTools"], true);
}

#[test]
fn enabled_follows_the_backend_flag() {
    let off = MockServer::start(|_| {
        (
            503,
            json!({"ok": false, "code": "agents_v2_disabled", "error": "off"}).to_string(),
        )
    });
    let cohort = MockServer::start(|_| {
        (
            403,
            json!({"ok": false, "code": "not_in_cohort", "error": "no"}).to_string(),
        )
    });
    let on = MockServer::start(|_| (200, json!({"runtimes": []}).to_string()));
    let down = MockServer::start(|_| (500, "{}".into()));
    let rt = runtime();
    assert_eq!(rt.block_on(enabled(&off.base, "t")), Ok(false));
    assert_eq!(rt.block_on(enabled(&cohort.base, "t")), Ok(false));
    assert_eq!(rt.block_on(enabled(&on.base, "t")), Ok(true));
    assert!(rt.block_on(enabled(&down.base, "t")).is_err());
}

#[test]
fn a_changed_selection_or_cli_version_needs_a_new_registration() {
    let record = Registered {
        runtime_id: "r".into(),
        host_id: "h".into(),
        account_scope: "s".into(),
        selection: selection("claude"),
        provider_version: "2.1.285".into(),
        capabilities: serde_json::Value::Null,
    };
    assert!(record.matches("s", "h", &selection("claude"), "2.1.285"));
    assert!(!record.matches("s", "h", &selection("claude"), "2.1.286"));
    assert!(!record.matches("s", "h", &selection("codex"), "2.1.285"));
    assert!(!record.matches("other", "h", &selection("claude"), "2.1.285"));
}
