use super::*;
use serde_json::json;

fn init(tools: &[&str], servers: &[(&str, &str)], key: &str) -> Init {
    Init {
        tools: tools.iter().map(|t| t.to_string()).collect(),
        mcp_servers: servers
            .iter()
            .map(|(n, s)| (n.to_string(), s.to_string()))
            .collect(),
        api_key_source: key.into(),
        model: "claude-haiku-4-5".into(),
        version: "2.1.285".into(),
    }
}

fn expected() -> Vec<String> {
    vec![
        "mcp__vibyra-broker__gmail_search".into(),
        "mcp__vibyra-broker__gmail_read".into(),
    ]
}

const BROKER: (&str, &str) = ("vibyra-broker", "connected");

#[test]
fn the_exact_manifest_passes_in_any_order() {
    let ok = init(
        &[
            "mcp__vibyra-broker__gmail_read",
            "mcp__vibyra-broker__gmail_search",
        ],
        &[BROKER],
        "none",
    );
    assert_eq!(check_init(&ok, &expected()), Ok(()));
}

#[test]
fn any_extra_missing_or_duplicated_tool_is_refused() {
    let cases: [&[&str]; 4] = [
        &[
            "mcp__vibyra-broker__gmail_search",
            "mcp__vibyra-broker__gmail_read",
            "Bash",
        ],
        &[
            "mcp__vibyra-broker__gmail_search",
            "mcp__vibyra-broker__gmail_read",
            "WebFetch",
        ],
        &["mcp__vibyra-broker__gmail_search"],
        &[
            "mcp__vibyra-broker__gmail_search",
            "mcp__vibyra-broker__gmail_search",
        ],
    ];
    for tools in cases {
        let refusal = check_init(&init(tools, &[BROKER], "none"), &expected()).unwrap_err();
        assert_eq!(refusal.code, "provider_error", "{tools:?}");
    }
    let bash = check_init(
        &init(
            &[
                "mcp__vibyra-broker__gmail_search",
                "mcp__vibyra-broker__gmail_read",
                "Bash",
            ],
            &[BROKER],
            "none",
        ),
        &expected(),
    )
    .unwrap_err();
    assert!(bash.reason.contains("Bash"));
}

#[test]
fn an_api_key_or_another_mcp_server_is_refused() {
    let tools = [
        "mcp__vibyra-broker__gmail_search",
        "mcp__vibyra-broker__gmail_read",
    ];
    assert!(check_init(&init(&tools, &[BROKER], "ANTHROPIC_API_KEY"), &expected()).is_err());
    assert!(check_init(&init(&tools, &[BROKER], "/login managed key"), &expected()).is_err());
    assert!(check_init(
        &init(&tools, &[BROKER, ("claude.ai Gmail", "connected")], "none"),
        &expected()
    )
    .is_err());
    assert!(check_init(&init(&tools, &[], "none"), &expected()).is_err());
}

#[test]
fn initialize_requires_a_signed_in_first_party_account() {
    let max = json!({"account": {"email": "a@b.c", "subscriptionType": "Claude Max", "apiProvider": "firstParty"}});
    assert!(check_initialize(&max).is_ok());
    assert_eq!(
        check_initialize(&json!({"account": {}})).unwrap_err().code,
        "provider_signin"
    );
    assert_eq!(
        check_initialize(&json!({})).unwrap_err().code,
        "provider_signin"
    );
    let bedrock = json!({"account": {"email": "a@b.c", "apiProvider": "bedrock"}});
    assert_eq!(
        check_initialize(&bedrock).unwrap_err().code,
        "provider_error"
    );
}

#[test]
fn mcp_status_accepts_only_a_connected_broker() {
    let status = |servers: serde_json::Value| check_mcp_status(&json!({ "mcpServers": servers }));
    assert_eq!(
        status(json!([{"name": "vibyra-broker", "status": "connected"}])),
        Ok(true)
    );
    assert_eq!(
        status(json!([{"name": "vibyra-broker", "status": "pending"}])),
        Ok(false)
    );
    assert!(status(json!([{"name": "vibyra-broker", "status": "failed"}])).is_err());
    assert!(status(json!([])).is_err());
    assert!(
        status(json!([{"name": "vibyra-broker", "status": "connected"},
        {"name": "github", "status": "connected"}]))
        .is_err()
    );
}
