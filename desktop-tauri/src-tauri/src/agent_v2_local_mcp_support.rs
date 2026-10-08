use super::*;
use crate::agent_v2::mock_http::MockServer;
use std::collections::BTreeMap;
use vibyra_core::local_mcp::{Limits, SecretSource};

pub(crate) const ID: &str = "11111111-2222-4333-8444-555555555555";
pub(crate) const RUN: &str = "99999999-2222-4333-8444-555555555555";
pub(crate) const CONN: &str = "aaaaaaaa-2222-4333-8444-555555555555";
pub(crate) const FP: &str = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

pub(crate) struct NoSecrets;
impl SecretSource for NoSecrets {
    fn read(&self, _: &str, _: &str) -> Result<Option<String>, String> {
        Ok(None)
    }
}

pub(crate) fn node() -> bool {
    let found = std::env::var_os("PATH")
        .is_some_and(|p| std::env::split_paths(&p).any(|d| d.join("node").is_file()));
    if !found {
        eprintln!("skipped: node is not on PATH");
    }
    found
}

/// A configured fixture server in a fresh settings folder.
pub(crate) fn setup(connection: Option<&str>, enabled: bool) -> (tempfile::TempDir, Engine) {
    let dir = tempfile::tempdir().unwrap();
    let script = format!(
        "{}/crates/vibyra-core/src/local_mcp/fixture/server.mjs",
        env!("CARGO_MANIFEST_DIR")
    );
    let spec = ServerSpec {
        id: "fixture-server-0001".into(),
        name: "Fixture".into(),
        command: "node".into(),
        args: vec![script],
        env: BTreeMap::from([("FIXTURE".into(), String::new())]),
        enabled,
        timeout_secs: Some(1),
        connection_id: connection.map(str::to_owned),
        ..ServerSpec::default()
    };
    store::upsert(dir.path(), spec).unwrap();
    let limits = Limits {
        probe_timeout: Duration::from_millis(400),
        ..Limits::default()
    };
    let engine = Engine {
        supervisor: Supervisor::new(limits, Arc::new(NoSecrets)),
        dir: dir.path().to_path_buf(),
    };
    (dir, engine)
}

pub(crate) fn action(
    tool: &str,
    kind: &str,
    state: &str,
    claimed: Option<u64>,
    arguments: Value,
) -> Value {
    json!({"id": ID, "tool": "lmcp_deadbeef__x", "kind": kind, "state": state, "fingerprint": FP,
        "claimedGeneration": claimed, "arguments": arguments,
        "server": {"connectionId": CONN, "localId": "fixture-server-0001", "generation": 1, "remoteName": tool}})
}

/// A backend that grants every claim and accepts every receipt.
pub(crate) fn backend(claim_state: &'static str) -> MockServer {
    MockServer::start(move |request| {
        if request.path.ends_with("/claim") {
            let state = if request.body.get("unavailable").is_some() {
                "refused"
            } else {
                claim_state
            };
            return (
                200,
                json!({"action": {"id": ID, "state": state, "claimedGeneration": 7}}).to_string(),
            );
        }
        (
            200,
            json!({"action": {"id": ID, "state": "completed"}}).to_string(),
        )
    })
}

pub(crate) fn lease(server: &MockServer) -> Lease {
    let api = RunnerApi {
        base: server.base.clone(),
        runtime_id: ID.into(),
        key: "k".repeat(64),
    };
    Lease {
        api,
        run: RUN.into(),
        generation: 7,
        secrets: false,
    }
}

pub(crate) fn bodies(server: &MockServer, suffix: &str) -> Vec<Value> {
    server
        .requests
        .lock()
        .unwrap()
        .iter()
        .filter(|r| r.path.ends_with(suffix))
        .map(|r| r.body.clone())
        .collect()
}

pub(crate) fn serve_one(engine: &Engine, server: &MockServer, action: &Value) {
    let lease = lease(server);
    tauri::async_runtime::block_on(async {
        serve(engine, &lease, action, &mut HashMap::new()).await;
    });
}
