//! The headless Host offers provider sign-in only where a CLI is installed, and
//! answers `aiAccounts.*` through the ordinary engine entry point.
#![cfg(unix)]
mod support;
use serde_json::json;
use support::agents::rig;

#[test]
fn host_state_advertises_resume_and_accounts_when_a_cli_is_on_path() {
    let rig = rig();
    let engine = rig.engine("state");
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    assert_eq!(state["capabilities"]["sessionResumeV1"], true);
    assert_eq!(state["capabilities"]["aiAccountsV1"], true);
    let list = engine
        .handle("phone", "aiAccounts.list", json!({}))
        .unwrap();
    assert_eq!(list["providers"][0]["id"], "codex");
    assert_eq!(list["providers"][1]["id"], "claude");
    assert_eq!(list["providers"][1]["installed"], true);
    assert!(engine
        .handle("phone", "aiAccounts.connect", json!({"provider":"gemini"}))
        .is_err());
}

#[test]
fn a_read_only_vault_engine_has_no_account_methods() {
    let rig = rig();
    let engine = vibyra_host_engine::Engine::new_read_only(
        rig.dir.path().join("vault-state"),
        "Vault".into(),
        rig.project.clone(),
    )
    .unwrap();
    let state = engine.handle("phone", "host.state", json!({})).unwrap();
    assert!(state["capabilities"]["aiAccountsV1"].is_null());
    assert!(engine
        .handle("phone", "aiAccounts.list", json!({}))
        .is_err());
}
