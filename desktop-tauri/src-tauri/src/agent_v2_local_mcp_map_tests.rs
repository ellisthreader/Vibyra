use super::*;
use vibyra_core::local_mcp::CallResult;

const CONN: &str = "aaaaaaaa-2222-4333-8444-555555555555";
const ID: &str = "11111111-2222-4333-8444-555555555555";
const FP: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

fn action(tool: &str, kind: &str, state: &str, claimed: Option<u64>, arguments: Value) -> Value {
    json!({"id": ID, "tool": "lmcp_deadbeef__x", "kind": kind, "state": state, "fingerprint": FP,
        "claimedGeneration": claimed, "arguments": arguments,
        "server": {"connectionId": CONN, "localId": "fixture-server-0001", "generation": 1, "remoteName": tool}})
}

#[test]
fn a_job_needs_the_servers_ids_and_the_tools_own_name() {
    let good = map::job(&action(
        "echo",
        "read",
        "approved",
        None,
        json!({"text": "hi"}),
    ))
    .unwrap();
    assert_eq!((good.remote_name.as_str(), good.is_write), ("echo", false));
    assert_eq!(good.arguments, json!({"text": "hi"}));
    let mut bad = action("echo", "read", "approved", None, json!({}));
    bad["server"]["remoteName"] = Value::Null;
    assert!(map::job(&bad).is_none());
    // Arguments are always an object on the wire, never `[]` or null.
    assert_eq!(
        map::job(&action("echo", "write", "approved", None, json!([])))
            .unwrap()
            .arguments,
        json!({})
    );
}

#[test]
fn only_a_timeout_or_crash_of_a_write_is_an_unknown_outcome() {
    let timeout = || Err(McpError::Timeout(Duration::from_secs(60)));
    assert_eq!(map::receipt(timeout(), true)["unknown"], true);
    assert!(
        map::receipt(timeout(), false).get("unknown").is_none(),
        "a read has no side effect to doubt"
    );
    let refused = map::receipt(Err(McpError::Disabled), true);
    assert!(refused.get("unknown").is_none(), "nothing was sent");
    assert_eq!(refused["reason"], "disabled");
    let crashed = map::receipt(Err(McpError::Crashed("x".into())), true);
    assert_eq!(
        (crashed["reason"].as_str(), crashed["unknown"].as_bool()),
        (Some("crashed"), Some(true))
    );
    let done = CallResult {
        text: "t".into(),
        structured: None,
        is_error: true,
        truncated: true,
    };
    assert_eq!(
        map::receipt(Ok(done), true),
        json!({"text": "t", "truncated": true, "isError": true})
    );
    assert_eq!(map::unrecordable(true)["unknown"], true);
    assert!(map::unrecordable(false).get("unknown").is_none());
    assert!(map::clip(&"é".repeat(400), 300).len() <= 300);
}
