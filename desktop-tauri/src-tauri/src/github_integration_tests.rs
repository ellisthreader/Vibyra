use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use super::*;
struct FakeGh {
    root: tempfile::TempDir,
    program: PathBuf,
}
impl FakeGh {
    fn new() -> Self {
        let root = tempfile::tempdir().unwrap();
        let program = root.path().join("gh");
        let state = root.path().to_string_lossy();
        let script = format!(
            r#"#!/bin/sh
state='{state}'
printf '%s\n' "$*" >> "$state/calls"
case "$1 $2" in
  '--version '*) echo 'gh version test'; exit 0 ;;
  'api user')
    test -f "$state/auth" || exit 1
    echo octocat
    exit 0 ;;
  'auth status')
    test -f "$state/auth" || exit 1
    if test -f "$state/full"; then scopes="'gist', 'repo', 'workflow', 'read:org'"; else scopes="'repo'"; fi
    printf "  Logged in to github.com account octocat (keyring)\n  - Token scopes: %s\n" "$scopes" >&2
    exit 0 ;;
  'auth login')
    mode=$(cat "$state/mode" 2>/dev/null)
    test "$mode" = zero && exit 0
    test "$mode" = no-code || printf '! First copy your one-time code: TEST-CODE\n' >&2
    IFS= read -r answer || exit 1
    touch "$state/newline-received"
    if test "$mode" = sleep; then echo $$ > "$state/child-pid"; touch "$state/started"; sleep 30; exit 0; fi
    touch "$state/auth" "$state/full"
    exit 0 ;;
  'auth refresh')
    printf '! First copy your one-time code: REFR-CODE\n' >&2
    IFS= read -r answer || exit 1
    touch "$state/refresh-newline" "$state/full"
    exit 0 ;;
  'auth logout')
    test -f "$state/logout-fail" && exit 1
    rm -f "$state/auth" "$state/full"
    exit 0 ;;
esac
exit 1
"#
        );
        std::fs::write(&program, script).unwrap();
        std::fs::set_permissions(&program, std::fs::Permissions::from_mode(0o755)).unwrap();
        Self { root, program }
    }
    fn mark(&self, name: &str) {
        std::fs::write(self.root.path().join(name), "1").unwrap();
    }
    fn mode(&self, mode: &str) {
        std::fs::write(self.root.path().join("mode"), mode).unwrap();
    }
    fn calls(&self) -> String {
        std::fs::read_to_string(self.root.path().join("calls")).unwrap_or_default()
    }
}
fn wait_for(
    manager: &GithubIntegrationManager,
    ready: impl Fn(&GithubIntegrationStatus) -> bool,
) -> GithubIntegrationStatus {
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        let status = manager.status();
        if ready(&status) || Instant::now() >= deadline {
            return status;
        }
        thread::sleep(Duration::from_millis(20));
    }
}
fn recording_manager(
    fake: &FakeGh,
) -> (
    GithubIntegrationManager,
    Arc<parking_lot::Mutex<Vec<String>>>,
) {
    let copied = Arc::new(parking_lot::Mutex::new(Vec::new()));
    let received = Arc::clone(&copied);
    let manager = GithubIntegrationManager::test_with_copier(
        fake.program.as_os_str(),
        Arc::new(move |code| {
            received.lock().push(code.to_owned());
            Ok(())
        }),
    );
    (manager, copied)
}

#[test]
fn reports_a_missing_cli_without_claiming_connection() {
    let manager = GithubIntegrationManager::test(Path::new("/definitely/missing/gh").as_os_str());
    let status = manager.status();
    assert!(!status.gh_installed);
    assert!(!status.connected);
    assert!(!status.permissions_ready);
}

#[test]
fn login_only_unlocks_after_identity_and_scopes_are_verified() {
    let fake = FakeGh::new();
    let (manager, copied) = recording_manager(&fake);
    assert!(manager.connect().connecting);
    let status = wait_for(&manager, |status| status.permissions_ready);
    assert_eq!(status.login.as_deref(), Some("octocat"));
    assert!(status.connected && status.permissions_ready);
    let deadline = Instant::now() + Duration::from_secs(1);
    while copied.lock().is_empty() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    assert_eq!(&*copied.lock(), &["TEST-CODE"]);
    assert!(fake.root.path().join("newline-received").exists());
    assert!(fake.calls().contains("auth login --hostname github.com --git-protocol https --web --scopes repo,workflow,read:org,gist"));
}

#[test]
fn output_without_a_device_code_is_never_copied() {
    let fake = FakeGh::new();
    fake.mode("no-code");
    let (manager, copied) = recording_manager(&fake);
    manager.connect();
    let status = wait_for(&manager, |status| status.permissions_ready);
    assert!(status.permissions_ready);
    assert!(copied.lock().is_empty());
}

#[test]
fn zero_exit_without_an_identity_is_not_success() {
    let fake = FakeGh::new();
    fake.mode("zero");
    let manager = GithubIntegrationManager::test(fake.program.as_os_str());
    manager.connect();
    let status = wait_for(&manager, |status| status.error.is_some());
    assert!(!status.connected && !status.permissions_ready);
    assert!(status.error.unwrap().contains("not verified"));
}

#[test]
fn existing_login_with_missing_scopes_is_refreshed() {
    let fake = FakeGh::new();
    fake.mark("auth");
    let (manager, copied) = recording_manager(&fake);
    let before = manager.connect();
    assert!(before.connected && !before.permissions_ready && before.connecting);
    let after = wait_for(&manager, |status| status.permissions_ready);
    assert!(after.permissions_ready);
    assert_eq!(&*copied.lock(), &["REFR-CODE"]);
    assert!(fake.root.path().join("refresh-newline").exists());
    assert!(fake
        .calls()
        .contains("auth refresh --hostname github.com --scopes repo,workflow,read:org,gist"));
}

#[test]
fn running_browser_login_can_be_cancelled() {
    let fake = FakeGh::new();
    fake.mode("sleep");
    let manager = GithubIntegrationManager::test(fake.program.as_os_str());
    assert!(manager.connect().connecting);
    let deadline = Instant::now() + Duration::from_secs(2);
    while !fake.root.path().join("started").exists() && Instant::now() < deadline {
        thread::sleep(Duration::from_millis(10));
    }
    let status = manager.cancel();
    assert!(!status.connecting && !status.connected);
    let pid = std::fs::read_to_string(fake.root.path().join("child-pid")).unwrap();
    let alive = std::process::Command::new("kill")
        .args(["-0", pid.trim()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .unwrap();
    assert!(!alive.success());
}

#[test]
fn failed_logout_keeps_the_connection_and_reports_failure() {
    let fake = FakeGh::new();
    fake.mark("auth");
    fake.mark("full");
    fake.mark("logout-fail");
    let manager = GithubIntegrationManager::test(fake.program.as_os_str());
    let status = manager.disconnect();
    assert!(status.connected && status.permissions_ready);
    assert!(status.error.unwrap().contains("still connected"));
    assert!(fake
        .calls()
        .contains("auth logout --hostname github.com --user octocat"));
}
