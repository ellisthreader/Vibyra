use super::*;
use crate::agent_v2::mock_http::MockServer;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

const RUN: &str = "11111111-1111-4111-8111-111111111111";
const RT: &str = "22222222-2222-4222-8222-222222222222";
const A: &str = "aaaaaaaa-0000-4000-8000-000000000001";
const B: &str = "bbbbbbbb-0000-4000-8000-000000000002";

fn entry(tool: &str, connection: &str, kind: &str) -> Value {
    json!({"tool": tool, "connectionId": connection, "account": "me@example.com", "kind": kind,
        "schemaRevision": "rev000000001", "description": "d", "parameters": {"type": "object"}})
}

fn broker(base: &str, manifest: Value) -> Broker {
    let mut broker = Broker::new(BrokerConfig {
        base: base.into(),
        runtime_id: RT.into(),
        key: "k".repeat(64),
        run_id: RUN.into(),
        generation: 3,
        manifest,
        armed_path: None,
    })
    .unwrap();
    broker.poll = Duration::from_millis(10);
    broker
}

fn runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .unwrap()
}

fn call(name: &str) -> Value {
    json!({"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": name,
        "arguments": {"query": "is:unread"}, "_meta": {"claudecode/toolUseId": "toolu_01abc"}}})
}

#[test]
fn tools_list_is_exactly_the_manifest_with_distinct_names() {
    let manifest = json!({"tools": [entry("gmail_search", A, "read"), entry("gmail_search", B, "read"),
        entry("gmail_send", A, "write")]});
    let broker = broker("http://127.0.0.1:9", manifest);
    let reply = runtime()
        .block_on(broker.handle(&json!({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})))
        .unwrap();
    let names: Vec<_> = reply["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .map(|tool| tool["name"].as_str().unwrap().to_owned())
        .collect();
    assert_eq!(
        names,
        [
            "gmail_search__aaaaaaaa",
            "gmail_search__bbbbbbbb",
            "gmail_send"
        ]
    );
    assert!(reply["result"]["tools"][2]["description"]
        .as_str()
        .unwrap()
        .contains("approval"));
}

#[test]
fn a_call_is_forwarded_with_lease_generation_and_mapped_connection() {
    let server = MockServer::start(|_| {
        (200, json!({"action": {"id": "x", "state": "completed", "result": {"messages": [{"subject": "Hi"}]}}}).to_string())
    });
    let manifest =
        json!({"tools": [entry("gmail_search", A, "read"), entry("gmail_search", B, "read")]});
    let broker = broker(&server.base, manifest);
    let reply = runtime()
        .block_on(broker.handle(&call("gmail_search__bbbbbbbb")))
        .unwrap();
    assert_eq!(reply["id"], 7);
    assert_eq!(reply["result"]["isError"], false);
    assert!(reply["result"]["content"][0]["text"]
        .as_str()
        .unwrap()
        .contains("Hi"));
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 1);
    let request = &requests[0];
    assert_eq!(
        request.path,
        format!("/api/agents/v2/runner/{RT}/runs/{RUN}/tools")
    );
    assert_eq!(request.runner_key.as_deref(), Some("k".repeat(64).as_str()));
    assert_eq!(
        request.authorization, None,
        "a runner route carries the runner key alone"
    );
    assert_eq!(request.body["generation"], 3);
    assert_eq!(request.body["callId"], "toolu_01abc");
    assert_eq!(request.body["tool"], "gmail_search");
    assert_eq!(request.body["connectionId"], B);
    assert_eq!(request.body["schemaRevision"], "rev000000001");
    assert_eq!(request.body["arguments"]["query"], "is:unread");
}

#[test]
fn tools_outside_the_manifest_never_reach_the_backend() {
    let server = MockServer::start(|_| (500, "{}".into()));
    let broker = broker(
        &server.base,
        json!({"tools": [entry("gmail_search", A, "read")]}),
    );
    let rt = runtime();
    for name in [
        "gmail_send",
        "Bash",
        "mcp__vibyra-broker__gmail_search",
        "gmail_search__aaaaaaaa",
    ] {
        let reply = rt.block_on(broker.handle(&call(name))).unwrap();
        assert_eq!(reply["result"]["isError"], true, "{name}");
    }
    assert!(server.paths().is_empty());
    let unknown = rt
        .block_on(broker.handle(&json!({"jsonrpc": "2.0", "id": 2, "method": "resources/list"})))
        .unwrap();
    assert_eq!(unknown["error"]["code"], -32601);
    assert!(rt
        .block_on(broker.handle(&json!({"jsonrpc": "2.0", "method": "notifications/initialized"})))
        .is_none());
}

#[path = "broker_approval_tests.rs"]
mod approval;

#[test]
fn the_broker_deletes_its_credential_file_as_soon_as_it_has_read_it() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("broker.json");
    let config = BrokerConfig {
        base: "http://127.0.0.1:9".into(),
        runtime_id: RT.into(),
        key: "k".repeat(64),
        run_id: RUN.into(),
        generation: 1,
        manifest: json!({"tools": []}),
        armed_path: None,
    };
    std::fs::write(&path, serde_json::to_string(&config).unwrap()).unwrap();
    let read = read_once(&path).expect("the configuration is read");
    assert_eq!(read.run_id, RUN);
    assert!(!path.exists(), "the credentials no longer sit on disk");
    assert!(
        read_once(&path).is_err(),
        "there is nothing left to read twice"
    );
}
