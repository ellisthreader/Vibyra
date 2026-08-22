use super::{accounts_root, AccountHome, DEFAULT_ACCOUNT};
use std::path::{Path, PathBuf};

fn under(provider: &str, id: &str, root: &Path) -> AccountHome {
    AccountHome::rooted(provider, id, Some(root.join(provider).join(id)))
}

fn fixture_root() -> PathBuf {
    std::env::temp_dir().join(format!("vibyra-account-home-{}", std::process::id()))
}

/// The account every existing install already has must keep using the CLI's
/// own directory. Anything else would strand the login the user already made.
#[test]
fn the_default_account_redirects_nothing() {
    for provider in ["codex", "claude", "gemini"] {
        let home = AccountHome::rooted(provider, DEFAULT_ACCOUNT, None);
        assert_eq!(home.env(), None, "{provider}");
        assert!(home.ensure().is_ok(), "{provider}");
    }
}

#[test]
fn an_added_account_names_the_variable_its_cli_reads() {
    let root = fixture_root();
    let names: Vec<String> = ["codex", "claude", "gemini"]
        .iter()
        .map(|provider| under(provider, "second", &root).env().unwrap().0)
        .collect();
    assert_eq!(
        names,
        ["CODEX_HOME", "CLAUDE_CONFIG_DIR", "GEMINI_CLI_HOME"]
    );
}

/// Gemini appends `.gemini` to whatever `GEMINI_CLI_HOME` names, so the
/// variable and the credential folder are deliberately different paths. Codex
/// and Claude are handed the folder itself. Getting this backwards would point
/// the probe at an empty directory and report a signed-in account as signed
/// out.
#[test]
fn gemini_is_handed_the_parent_of_its_credentials() {
    let root = fixture_root();
    let gemini = under("gemini", "second", &root);
    let named = gemini.env().unwrap().1;
    assert_eq!(
        gemini.credentials_dir(),
        std::path::Path::new(&named).join(".gemini")
    );

    for provider in ["codex", "claude"] {
        let home = under(provider, "second", &root);
        assert_eq!(
            home.credentials_dir().to_string_lossy(),
            home.env().unwrap().1,
            "{provider}"
        );
    }
}

#[test]
fn accounts_are_kept_apart_by_provider_and_id() {
    let root = fixture_root();
    let a = under("codex", "one", &root);
    let b = under("codex", "two", &root);
    let c = under("claude", "one", &root);
    assert_ne!(a.credentials_dir(), b.credentials_dir());
    assert_ne!(a.credentials_dir(), c.credentials_dir());
}

/// Creating a home must produce the folder the CLI will actually read, which
/// for Gemini is one level below what its variable names.
#[test]
fn ensuring_a_home_creates_the_folder_the_cli_reads() {
    let root = fixture_root().join("ensure");
    for provider in ["codex", "claude", "gemini"] {
        let home = under(provider, "second", &root);
        home.ensure().unwrap();
        assert!(home.credentials_dir().is_dir(), "{provider}");
    }
    let _ = std::fs::remove_dir_all(&root);
}

/// The managed root is under the user's config directory. With none available
/// the only fallback would be a temporary one, which Codex refuses to run in.
#[test]
fn managed_accounts_live_beside_the_settings_file() {
    match accounts_root() {
        Ok(root) => {
            assert!(root.ends_with("accounts"));
            assert!(root.to_string_lossy().contains("vibyra-desktop"));
        }
        Err(error) => assert!(error.contains("configuration folder"), "{error}"),
    }
}
