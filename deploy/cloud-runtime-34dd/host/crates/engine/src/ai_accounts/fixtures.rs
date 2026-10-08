//! Fake provider CLIs (shell scripts on a private PATH) and helpers to drive them.
use super::*;
use std::{os::unix::fs::PermissionsExt, path::Path};

pub(super) const SECRET: &str = "TOP-SECRET-TOKEN";

pub(super) const CODEX: &str = r#"#!/bin/sh
state="$HOME/.fake-codex"
case "$1" in
  --version) echo "codex-cli 9.9.9"; exit 0;;
  logout) rm -f "$state"; exit 0;;
  login)
    case "$2" in
      status) if [ -f "$state" ]; then echo "Logged in using ChatGPT" >&2; exit 0; fi
              echo "Not logged in" >&2; exit 1;;
      --device-auth)
        echo $$ > "$HOME/codex.pid"
        echo "key=${OPENAI_API_KEY:-unset} token=${VIBYRA_RUNTIME_TOKEN:-unset}" > "$HOME/codex.env"
        printf '1. Open this link\n   https://auth.example.test/codex/device\n\n2. Enter this one-time code (expires in 15 minutes)\n   ABCD-EFGH\n\n'
        read answer
        if [ "$answer" = "approve" ]; then
          mkdir -p "$HOME/.codex"
          echo '{"tokens":{"access_token":"TOP-SECRET-TOKEN"}}' > "$HOME/.codex/auth.json"
          touch "$state"; exit 0
        fi
        echo "error: the code was rejected" >&2; exit 3;;
    esac;;
esac
exit 2
"#;

pub(super) const CLAUDE: &str = r#"#!/bin/sh
state="$HOME/.fake-claude"
case "$1" in
  --version) echo "2.1.0 (Claude Code)"; exit 0;;
  auth)
    case "$2" in
      status) if [ -f "$state" ]; then
                echo '{"loggedIn":true,"authMethod":"claude.ai","email":"me@example.test","subscriptionType":"max","apiKey":"TOP-SECRET-TOKEN"}'; exit 0
              fi
              echo '{"loggedIn":false}'; exit 1;;
      logout) rm -f "$state"; exit 0;;
      login)
        echo $$ > "$HOME/claude.pid"
        printf 'Opening browser to sign in...\nIf the browser did not open, visit: https://claude.com/cai/oauth/authorize?code=true\nPaste code here if prompted > '
        read code
        if [ "$code" = "good-code" ]; then touch "$state"; exit 0; fi
        exit 1;;
    esac;;
esac
exit 2
"#;

pub(super) struct Fixture {
    pub dir: tempfile::TempDir,
    pub manager: Manager,
}

pub(super) fn script(dir: &Path, name: &str, body: &str) {
    let path = dir.join(name);
    std::fs::write(&path, body).unwrap();
    std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
}

pub(super) fn fixture(clis: &[(&str, &str)], limits: Limits) -> Fixture {
    let dir = tempfile::tempdir().unwrap();
    let (bin, home) = (dir.path().join("bin"), dir.path().join("home"));
    std::fs::create_dir_all(&bin).unwrap();
    std::fs::create_dir_all(&home).unwrap();
    for (name, body) in clis {
        script(&bin, name, body);
    }
    let path = std::env::join_paths([bin, "/usr/bin".into(), "/bin".into()]).unwrap();
    Fixture {
        dir,
        manager: Manager::build(Env::with(path, home), limits),
    }
}

pub(super) fn both() -> Fixture {
    fixture(&[("codex", CODEX), ("claude", CLAUDE)], Limits::default())
}

pub(super) fn call(f: &Fixture, method: &str, params: Value) -> Result<Value, String> {
    f.manager.handle(&format!("aiAccounts.{method}"), &params)
}

pub(super) fn account(snapshot: &Value, provider: &str) -> Value {
    let row = snapshot["providers"]
        .as_array()
        .unwrap()
        .iter()
        .find(|p| p["id"] == provider)
        .unwrap();
    row["accounts"][0].clone()
}

pub(super) fn wait(mut condition: impl FnMut() -> bool) {
    let deadline = Instant::now() + Duration::from_secs(8);
    while Instant::now() < deadline {
        if condition() {
            return;
        }
        std::thread::sleep(Duration::from_millis(30));
    }
    assert!(condition(), "condition did not become true in time");
}
