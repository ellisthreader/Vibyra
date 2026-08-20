#![cfg(unix)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::provider_auth::ProviderAuthManager;

struct TestRoot(PathBuf);

impl TestRoot {
    fn new() -> Self {
        let id = format!(
            "vibyra-provider-matrix-{}-{}",
            std::process::id(),
            Instant::now().elapsed().as_nanos()
        );
        let path = std::env::temp_dir().join(id);
        fs::create_dir(&path).unwrap();
        Self(path)
    }
}

impl Drop for TestRoot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

fn executable(path: &Path, body: &str) {
    fs::write(path, body).unwrap();
    fs::set_permissions(path, fs::Permissions::from_mode(0o700)).unwrap();
}

fn status<'a>(
    accounts: &'a [crate::provider_auth_state::ProviderAccountView],
    id: &str,
) -> &'a str {
    accounts
        .iter()
        .find(|account| account.id == id)
        .map(|account| account.status.as_str())
        .unwrap()
}

#[test]
fn isolated_fake_provider_matrix() {
    if std::env::var("VIBYRA_PROVIDER_FAKE_MATRIX").as_deref() != Ok("1") {
        return;
    }
    let root = TestRoot::new();
    let bin = root.0.join("bin");
    fs::create_dir(&bin).unwrap();
    executable(
        &bin.join("codex"),
        r#"#!/bin/sh
state="$HOME/.fake-codex-connected"
if [ "$1" = login ] && [ "$2" = status ]; then
  sleep 1
  # The real CLI reports on stderr, so the fake must too.
  if [ -f "$state" ]; then echo 'Logged in using ChatGPT' >&2; exit 0; fi
  echo 'Not logged in' >&2; exit 1
fi
if [ "$1" = login ]; then echo 'https://example.test/codex-login'; exit 0; fi
if [ "$1" = logout ]; then
  if [ -f "$HOME/.fake-logout-fail" ]; then exit 9; fi
  rm -f "$state"; exit 0
fi
exit 2
"#,
    );
    executable(
        &bin.join("claude"),
        r#"#!/bin/sh
if [ "$1" = auth ] && [ "$2" = status ]; then
  sleep 1
  echo '{"loggedIn":false,"authMethod":"none"}'; exit 0
fi
if [ "$1" = auth ] && [ "$2" = login ]; then
  echo 'https://example.test/claude-login'; exit 0
fi
if [ "$1" = auth ] && [ "$2" = logout ]; then exit 1; fi
exit 2
"#,
    );
    executable(&bin.join("gemini"), "#!/bin/sh\nexit 0\n");
    let old_path = std::env::var_os("PATH").unwrap_or_default();
    let path =
        std::env::join_paths(std::iter::once(bin).chain(std::env::split_paths(&old_path))).unwrap();
    std::env::set_var("HOME", &root.0);
    std::env::set_var("PATH", path);

    let manager = ProviderAuthManager::default();
    let started = Instant::now();
    let accounts = manager.accounts();
    assert!(started.elapsed() < Duration::from_millis(2_500));
    assert_eq!(status(&accounts, "codex"), "sign-in-required");
    assert_eq!(status(&accounts, "claude"), "sign-in-required");

    fs::write(root.0.join(".fake-codex-connected"), "fixture").unwrap();
    assert_eq!(status(&manager.accounts(), "codex"), "connected");
    fs::remove_file(root.0.join(".fake-codex-connected")).unwrap();

    let accounts = manager.connect("codex").unwrap();
    assert_eq!(status(&accounts, "codex"), "connecting");
    std::thread::sleep(Duration::from_millis(3_100));
    assert_eq!(status(&manager.accounts(), "codex"), "error");

    fs::write(root.0.join(".fake-codex-connected"), "fixture").unwrap();
    fs::write(root.0.join(".fake-logout-fail"), "fixture").unwrap();
    assert!(manager.disconnect("codex").is_err());
    fs::remove_file(root.0.join(".fake-codex-connected")).unwrap();
    assert!(manager.disconnect("codex").is_ok());
}
