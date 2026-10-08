#![cfg(unix)]

use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use crate::provider_auth::ProviderAuthManager;
use crate::provider_auth_home::DEFAULT_ACCOUNT;
use crate::provider_auth_probe::CACHE_TTL;
use crate::provider_auth_state::{ProviderAccountView, ProviderView};

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

/// Points HOME and PATH at a throwaway tree. Process-wide, so these tests need
/// `--test-threads=1`.
fn isolate(root: &TestRoot) -> PathBuf {
    let bin = root.0.join("bin");
    fs::create_dir(&bin).unwrap();
    let inherited = std::env::var_os("PATH").unwrap_or_default();
    let path =
        std::env::join_paths(std::iter::once(bin.clone()).chain(std::env::split_paths(&inherited)))
            .unwrap();
    std::env::set_var("HOME", &root.0);
    std::env::set_var("PATH", path);
    // Extra accounts land under the config directory, which follows HOME.
    std::env::remove_var("XDG_CONFIG_HOME");
    std::env::remove_var("CODEX_HOME");
    std::env::remove_var("CLAUDE_CONFIG_DIR");
    std::env::remove_var("GEMINI_CLI_HOME");
    bin
}

/// Gives a spawned fake CLI time to finish writing before the row is read.
/// Well inside the 3s window after which an exited sign-in counts as failed.
fn settle() {
    std::thread::sleep(Duration::from_millis(400));
}

fn skip() -> bool {
    std::env::var("VIBYRA_PROVIDER_FAKE_MATRIX").as_deref() != Ok("1")
}

fn provider<'a>(views: &'a [ProviderView], id: &str) -> &'a ProviderView {
    views.iter().find(|view| view.id == id).unwrap()
}

fn account<'a>(views: &'a [ProviderView], id: &str, account: &str) -> &'a ProviderAccountView {
    provider(views, id)
        .accounts
        .iter()
        .find(|row| row.account_id == account)
        .unwrap()
}

fn first<'a>(views: &'a [ProviderView], id: &str) -> &'a ProviderAccountView {
    account(views, id, DEFAULT_ACCOUNT)
}

/// A fake that keeps its sign-in wherever its home variable points, exactly as
/// the real CLIs do. Without that these tests cannot tell isolation from luck.
const FAKE_CODEX: &str = r#"#!/bin/sh
home="${CODEX_HOME:-$HOME/.codex}"
if [ "$1" = login ] && [ "$2" = status ]; then
  # The real CLI reports on stderr, so the fake must too.
  if [ -f "$home/connected" ]; then echo 'Logged in using ChatGPT' >&2; exit 0; fi
  echo 'Not logged in' >&2; exit 1
fi
if [ "$1" = login ]; then
  echo 'https://example.test/codex-login'
  mkdir -p "$home" && touch "$home/connected"
  exit 0
fi
if [ "$1" = logout ]; then
  if [ -f "$HOME/.fake-logout-fail" ]; then exit 9; fi
  rm -f "$home/connected"; exit 0
fi
exit 2
"#;

const FAKE_CLAUDE: &str = r#"#!/bin/sh
home="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"
if [ "$1" = auth ] && [ "$2" = status ]; then
  if [ -f "$home/connected" ]; then
    echo "{\"loggedIn\":true,\"authMethod\":\"claude.ai\",\"email\":\"$(cat "$home/connected")\",\"subscriptionType\":\"max\"}"
  else
    echo '{"loggedIn":false,"authMethod":"none"}'
  fi
  exit 0
fi
if [ "$1" = auth ] && [ "$2" = login ]; then
  echo 'If the browser did not open, visit: https://example.test/claude-login'
  printf 'Paste code here if prompted > '
  read code
  if [ -n "$code" ]; then mkdir -p "$home" && echo "$code@example.test" > "$home/connected"; fi
  exit 0
fi
if [ "$1" = auth ] && [ "$2" = logout ]; then rm -f "$home/connected"; exit 0; fi
exit 2
"#;

/// The whole reported failure, end to end: `claude auth login` prints a link,
/// then stops and waits to be told the code the browser hands back. Spawned
/// with stdin on `/dev/null` it never can be, and the row sits on "Authorizing"
/// until it is cancelled.
#[test]
fn a_login_that_asks_for_a_pasted_code_can_be_answered() {
    if skip() {
        return;
    }
    let root = TestRoot::new();
    let bin = isolate(&root);
    executable(&bin.join("codex"), "#!/bin/sh\nexit 1\n");
    executable(&bin.join("gemini"), "#!/bin/sh\nexit 0\n");
    executable(&bin.join("claude"), FAKE_CLAUDE);

    let manager = ProviderAuthManager::default();
    assert_eq!(
        first(&manager.accounts(), "claude").status,
        "sign-in-required"
    );

    manager.connect("claude", DEFAULT_ACCOUNT).unwrap();
    std::thread::sleep(Duration::from_millis(700));
    let waiting = manager.accounts();
    let claude = first(&waiting, "claude");
    assert_eq!(claude.status, "connecting");
    assert_eq!(claude.prompt, "Paste code here if prompted >");
    assert!(
        claude.sign_in_page_available,
        "the printed link was captured"
    );

    manager
        .submit("claude", DEFAULT_ACCOUNT, "code-from-the-browser")
        .unwrap();
    std::thread::sleep(Duration::from_millis(500));
    let claude = first(&manager.accounts(), "claude").clone();
    assert_eq!(claude.status, "connected");
    assert_eq!(claude.account_label, "code-from-the-browser@example.test");
}

/// The multi-account half lives next door to keep both files inside the
/// 200-line limit; a child module so it still shares the fakes and helpers.
#[path = "provider_auth_accounts_tests.rs"]
mod accounts;
