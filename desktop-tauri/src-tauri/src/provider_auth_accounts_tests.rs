//! Holding more than one account for the same company.
//!
//! Shares the fake CLIs and helpers from the parent module: those fakes
//! keep their sign-in wherever their home variable points, which is the
//! only reason these tests can tell isolation from coincidence.

use super::*;

#[test]
fn isolated_fake_provider_matrix() {
    if skip() {
        return;
    }
    let root = TestRoot::new();
    let bin = isolate(&root);
    executable(&bin.join("codex"), FAKE_CODEX);
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

    let manager = ProviderAuthManager::default();
    let started = Instant::now();
    let views = manager.accounts();
    assert!(started.elapsed() < Duration::from_millis(2_500));
    assert_eq!(first(&views, "codex").status, "sign-in-required");
    assert_eq!(first(&views, "claude").status, "sign-in-required");

    // Signing in behind the CLI's back is the one case the probe cache can
    // lag, so this waits it out exactly as a user watching the pane would.
    let codex_home = root.0.join(".codex");
    fs::create_dir_all(&codex_home).unwrap();
    fs::write(codex_home.join("connected"), "fixture").unwrap();
    std::thread::sleep(CACHE_TTL + Duration::from_millis(200));
    assert_eq!(first(&manager.accounts(), "codex").status, "connected");
    fs::remove_file(codex_home.join("connected")).unwrap();

    // Connect returns while the CLI is still working — a real sign-in is a
    // browser round-trip — so the row says "connecting" first and only turns
    // over once the CLI has actually written its credentials.
    let views = manager.connect("codex", DEFAULT_ACCOUNT).unwrap();
    assert_eq!(first(&views, "codex").status, "connecting");
    settle();
    assert_eq!(first(&manager.accounts(), "codex").status, "connected");

    fs::write(root.0.join(".fake-logout-fail"), "fixture").unwrap();
    assert!(manager.disconnect("codex", DEFAULT_ACCOUNT).is_err());
    fs::remove_file(root.0.join(".fake-logout-fail")).unwrap();
    assert!(manager.disconnect("codex", DEFAULT_ACCOUNT).is_ok());
}

/// The feature itself: two ChatGPT logins that do not overwrite each other.
///
/// Each account gets its own folder, so signing one in leaves the other signed
/// out, and signing one out leaves the other signed in. If the home variable
/// were ignored both rows would move together and this would fail.
#[test]
fn two_accounts_under_one_provider_stay_separate() {
    if skip() {
        return;
    }
    let root = TestRoot::new();
    let bin = isolate(&root);
    executable(&bin.join("codex"), FAKE_CODEX);
    executable(&bin.join("claude"), "#!/bin/sh\nexit 1\n");
    executable(&bin.join("gemini"), "#!/bin/sh\nexit 0\n");

    let manager = ProviderAuthManager::default();
    manager.connect("codex", DEFAULT_ACCOUNT).unwrap();
    settle();
    assert_eq!(first(&manager.accounts(), "codex").status, "connected");

    // Adding an account signs the *new* one in without touching the first.
    let views = manager.add_account("codex").unwrap();
    settle();
    let ids: Vec<String> = provider(&views, "codex")
        .accounts
        .iter()
        .map(|row| row.account_id.clone())
        .collect();
    assert_eq!(ids.len(), 2, "the first account is still listed");
    assert_eq!(ids[0], DEFAULT_ACCOUNT);
    let second = ids[1].clone();

    let views = manager.accounts();
    assert_eq!(first(&views, "codex").status, "connected");
    assert_eq!(account(&views, "codex", &second).status, "connected");

    // Their credentials are genuinely different files.
    let managed = root
        .0
        .join(".config/vibyra-desktop/accounts/codex")
        .join(&second)
        .join("connected");
    assert!(
        managed.is_file(),
        "the second account signed in to its own folder"
    );
    assert!(
        root.0.join(".codex/connected").is_file(),
        "the first is untouched"
    );

    // Signing the second out leaves the first signed in.
    manager.disconnect("codex", &second).unwrap();
    let views = manager.accounts();
    assert_eq!(account(&views, "codex", &second).status, "sign-in-required");
    assert_eq!(first(&views, "codex").status, "connected");

    // Removing it takes its folder with it and leaves one account behind.
    let views = manager.remove_account("codex", &second).unwrap();
    assert_eq!(provider(&views, "codex").accounts.len(), 1);
    assert!(!managed.exists());
    assert_eq!(first(&views, "codex").status, "connected");
}

/// The first account is the CLI's own folder: signing out of it is fine,
/// deleting it is not Vibyra's call.
#[test]
fn the_first_account_can_be_signed_out_but_not_removed() {
    if skip() {
        return;
    }
    let root = TestRoot::new();
    let bin = isolate(&root);
    executable(&bin.join("codex"), FAKE_CODEX);
    executable(&bin.join("claude"), "#!/bin/sh\nexit 1\n");
    executable(&bin.join("gemini"), "#!/bin/sh\nexit 0\n");

    let manager = ProviderAuthManager::default();
    assert!(!first(&manager.accounts(), "codex").removable);
    let error = manager
        .remove_account("codex", DEFAULT_ACCOUNT)
        .unwrap_err();
    assert!(error.contains("cannot be removed"), "{error}");
}
