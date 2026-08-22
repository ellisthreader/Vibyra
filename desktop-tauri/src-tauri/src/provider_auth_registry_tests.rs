use super::{Registry, MAX_PER_PROVIDER};
use crate::provider_auth_home::DEFAULT_ACCOUNT;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static FIXTURE_ID: AtomicU64 = AtomicU64::new(1);

struct TestRoot(PathBuf);

impl TestRoot {
    fn new() -> Self {
        let id = FIXTURE_ID.fetch_add(1, Ordering::Relaxed);
        let path =
            std::env::temp_dir().join(format!("vibyra-registry-{}-{id}", std::process::id()));
        fs::create_dir_all(&path).unwrap();
        Self(path)
    }

    fn path(&self) -> &Path {
        &self.0
    }
}

impl Drop for TestRoot {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

/// Every provider always has the account the user already signed in to, and it
/// comes first. It is synthesised rather than stored so it cannot go missing.
#[test]
fn the_default_account_always_exists_and_leads() {
    let root = TestRoot::new();
    let registry = Registry::load_from(root.path());
    for provider in ["codex", "claude", "gemini"] {
        assert_eq!(registry.ids(provider), vec![DEFAULT_ACCOUNT.to_string()]);
    }
}

#[test]
fn an_added_account_survives_a_reload_and_keeps_its_folder() {
    let root = TestRoot::new();
    let mut registry = Registry::load_from(root.path());
    let id = registry.add("codex").unwrap();

    let reloaded = Registry::load_from(root.path());
    assert_eq!(
        reloaded.ids("codex"),
        vec![DEFAULT_ACCOUNT.to_string(), id.clone()]
    );
    // Untouched: adding a ChatGPT account must not invent a Claude one.
    assert_eq!(reloaded.ids("claude"), vec![DEFAULT_ACCOUNT.to_string()]);
    assert!(reloaded
        .home("codex", &id)
        .unwrap()
        .credentials_dir()
        .is_dir());
}

#[test]
fn removing_an_account_forgets_it_and_deletes_its_credentials() {
    let root = TestRoot::new();
    let mut registry = Registry::load_from(root.path());
    let first = registry.add("codex").unwrap();
    let second = registry.add("codex").unwrap();
    let folder = registry.home("codex", &first).unwrap().credentials_dir();
    fs::write(folder.join("auth.json"), "{}").unwrap();

    registry.remove("codex", &first).unwrap();
    assert!(!folder.exists(), "the credentials went with the account");
    assert_eq!(
        Registry::load_from(root.path()).ids("codex"),
        vec![DEFAULT_ACCOUNT.to_string(), second],
        "the other account is untouched"
    );
}

/// The first account is the CLI's own directory. Signing out of it is the
/// user's business; deleting it is not Vibyra's.
#[test]
fn the_default_account_cannot_be_deleted() {
    let root = TestRoot::new();
    let mut registry = Registry::load_from(root.path());
    let error = registry.remove("codex", DEFAULT_ACCOUNT).unwrap_err();
    assert!(error.contains("cannot be removed"), "{error}");
    assert!(registry.remove("codex", "never-added").is_err());
}

/// Each account costs a CLI probe on every refresh, so the list is bounded.
#[test]
fn the_number_of_accounts_is_capped() {
    let root = TestRoot::new();
    let mut registry = Registry::load_from(root.path());
    for _ in 1..MAX_PER_PROVIDER {
        registry.add("gemini").unwrap();
    }
    assert_eq!(registry.ids("gemini").len(), MAX_PER_PROVIDER);
    let error = registry.add("gemini").unwrap_err();
    assert!(error.contains("per provider"), "{error}");
}

/// A file from an unknown build is discarded rather than guessed at — the same
/// rule `session_store` applies to its own version field.
#[test]
fn a_foreign_version_is_discarded_rather_than_guessed_at() {
    let root = TestRoot::new();
    fs::write(
        root.path().join("accounts.json"),
        r#"{"version":99,"accounts":[{"provider":"codex","id":"x"}]}"#,
    )
    .unwrap();
    assert_eq!(
        Registry::load_from(root.path()).ids("codex"),
        vec![DEFAULT_ACCOUNT.to_string()]
    );
}

#[test]
fn an_unknown_account_has_no_home_to_hand_out() {
    let root = TestRoot::new();
    let registry = Registry::load_from(root.path());
    assert!(registry.home("codex", "made-up").is_err());
    assert!(registry
        .home("codex", DEFAULT_ACCOUNT)
        .unwrap()
        .env()
        .is_none());
}
