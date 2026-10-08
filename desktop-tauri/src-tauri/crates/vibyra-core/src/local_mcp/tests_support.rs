//! Shared helpers: the node fixture server, a fake keychain, a supervisor with
//! short limits. Tests skip (loudly) where node is not installed.

use super::*;
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub fn node_available() -> bool {
    let found = crate::agents::program_in_path("node");
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

#[cfg(unix)]
pub fn alive(pid: i32) -> bool {
    // SAFETY: signal 0 only checks that the pid exists.
    unsafe { libc::kill(pid, 0) == 0 }
}

#[cfg(windows)]
pub fn alive(pid: i32) -> bool {
    use windows_sys::Win32::Foundation::{CloseHandle, STILL_ACTIVE};
    use windows_sys::Win32::System::Threading::{
        GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };
    // SAFETY: a query-only handle that is closed before returning.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid as u32);
        if handle.is_null() {
            return false;
        }
        let mut code = 0u32;
        let read = GetExitCodeProcess(handle, &mut code);
        CloseHandle(handle);
        read != 0 && code == STILL_ACTIVE as u32
    }
}

/// Ends a fixture process the way an outside kill would.
pub fn kill(pid: i32) {
    #[cfg(unix)]
    // SAFETY: plain kill(2) on the fixture's own pid.
    unsafe {
        libc::kill(pid, libc::SIGKILL);
    }
    #[cfg(windows)]
    // SAFETY: a terminate-only handle that is closed before returning.
    unsafe {
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::Threading::{
            OpenProcess, TerminateProcess, PROCESS_TERMINATE,
        };
        let handle = OpenProcess(PROCESS_TERMINATE, 0, pid as u32);
        if !handle.is_null() {
            TerminateProcess(handle, 1);
            CloseHandle(handle);
        }
    }
}

pub fn gone_within(pid: i32, wait: Duration) -> bool {
    let end = std::time::Instant::now() + wait;
    while alive(pid) && std::time::Instant::now() < end {
        std::thread::sleep(Duration::from_millis(25));
    }
    !alive(pid)
}
