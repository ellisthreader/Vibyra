//! Shared helpers: the node fixture server, a fake keychain, a supervisor with
//! short limits. Tests skip (loudly) where node is not installed.

use super::*;
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub fn node_available() -> bool {
    let found = std::env::var_os("PATH")
        .is_some_and(|p| std::env::split_paths(&p).any(|d| d.join("node").is_file()));
    if !found {
        eprintln!("skipped: node is not on PATH, so the fixture MCP server cannot run");
    }
    found
}

pub fn fixture() -> String {
    format!(
        "{}/src/local_mcp/fixture/server.mjs",
        env!("CARGO_MANIFEST_DIR")
    )
}

#[derive(Default)]
pub struct FakeKeychain(pub Mutex<BTreeMap<String, String>>);

impl SecretSource for FakeKeychain {
    fn read(&self, server_id: &str, name: &str) -> Result<Option<String>, String> {
        Ok(self
            .0
            .lock()
            .unwrap()
            .get(&format!("{server_id}/{name}"))
            .cloned())
    }
}

/// Short bounds so failure paths run in milliseconds.
pub fn quick() -> Limits {
    Limits {
        idle_stop: Duration::from_secs(600),
        default_call: Duration::from_secs(5),
        start_timeout: Duration::from_secs(10),
        probe_timeout: Duration::from_millis(400),
        restart_backoff: vec![Duration::from_millis(150), Duration::from_millis(300)],
        max_failures: 3,
        stop_grace: Duration::from_millis(300),
        ..Limits::default()
    }
}

/// The parent environment carries "provider keys" a server must never see.
pub fn polluted_env() -> BTreeMap<String, String> {
    let mut env = env::parent_env();
    for (k, v) in [
        ("ANTHROPIC_API_KEY", "sk-parent-leak"),
        ("CLAUDE_CODE_OAUTH_TOKEN", "oauth-parent-leak"),
        ("OPENAI_API_KEY", "sk-openai-leak"),
        ("VIBYRA_RUNNER_KEY", "runner-leak"),
        ("DYLD_INSERT_LIBRARIES", "/tmp/evil.dylib"),
        ("SOMETHING_ELSE", "x"),
    ] {
        env.insert(k.into(), v.into());
    }
    env
}

pub fn supervisor(limits: Limits, keychain: Arc<FakeKeychain>) -> Arc<Supervisor> {
    Supervisor::with_env(limits, keychain, Box::new(polluted_env))
}

/// A fixture server definition; `flags` is the fixture's FIXTURE variable.
pub fn spec(id: &str, flags: &str) -> ServerSpec {
    ServerSpec {
        id: format!("test-{id}-0000"),
        name: "Fixture".into(),
        command: "node".into(),
        args: vec![fixture()],
        env: BTreeMap::from([("FIXTURE".into(), flags.into())]),
        enabled: true,
        ..ServerSpec::default()
    }
}

pub fn text(result: &CallResult) -> &str {
    &result.text
}

pub fn alive(pid: i32) -> bool {
    // SAFETY: signal 0 only checks that the pid exists.
    unsafe { libc::kill(pid, 0) == 0 }
}

pub fn gone_within(pid: i32, wait: Duration) -> bool {
    let end = std::time::Instant::now() + wait;
    while alive(pid) && std::time::Instant::now() < end {
        std::thread::sleep(Duration::from_millis(25));
    }
    !alive(pid)
}
