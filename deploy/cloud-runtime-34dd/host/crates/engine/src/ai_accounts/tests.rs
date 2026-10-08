use super::fixtures::*;
use super::*;

#[test]
fn the_capability_needs_one_cli_on_path() {
    let none = fixture(&[], Limits::default());
    let path = none.dir.path().join("bin");
    let empty = Manager::build(
        Env::with(path.into(), none.dir.path().join("home")),
        Limits::default(),
    );
    assert!(!empty.available());
    assert!(fixture(&[("claude", CLAUDE)], Limits::default())
        .manager
        .available());
    assert!(both().manager.available());
}

#[test]
fn list_reports_installed_cli_versions_and_the_two_providers_only() {
    let f = both();
    let list = call(&f, "list", json!({})).unwrap();
    let ids: Vec<_> = list["providers"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| p["id"].clone())
        .collect();
    assert_eq!(ids, ["codex", "claude"]);
    let codex = &list["providers"][0];
    assert_eq!(codex["installed"], true);
    assert_eq!(codex["version"], "codex-cli 9.9.9");
    assert_eq!(codex["canAddAccount"], false);
    assert_eq!(list["defaults"]["codex"], "default");
    let row = account(&list, "codex");
    assert_eq!(
        (row["status"].as_str(), row["accountId"].as_str()),
        (Some("sign-in-required"), Some("default"))
    );
    assert_eq!(row["removable"], false);
    assert_eq!(
        call(&f, "refresh", json!({})).unwrap()["providers"]
            .as_array()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn status_is_parsed_from_each_clis_own_report() {
    let f = both();
    std::fs::write(f.dir.path().join("home/.fake-claude"), "").unwrap();
    std::fs::write(f.dir.path().join("home/.fake-codex"), "").unwrap();
    let list = call(&f, "list", json!({})).unwrap();
    let claude = account(&list, "claude");
    assert_eq!(claude["status"], "connected");
    assert_eq!(claude["accountLabel"], "me@example.test");
    assert_eq!(claude["detail"], "Claude Max");
    assert_eq!(account(&list, "codex")["status"], "connected");
    assert!(!list.to_string().contains(SECRET));
}

#[test]
fn a_missing_cli_is_not_installed() {
    let f = fixture(&[("codex", CODEX)], Limits::default());
    let list = call(&f, "list", json!({})).unwrap();
    assert_eq!(list["providers"][1]["installed"], false);
    assert_eq!(account(&list, "claude")["status"], "not-installed");
    assert!(call(&f, "connect", json!({"provider":"claude"})).is_err());
    assert!(call(&f, "install", json!({"provider":"claude"})).is_err());
    assert!(call(&f, "install", json!({"provider":"codex"})).is_ok());
}

#[test]
fn only_the_default_account_and_known_actions_are_accepted() {
    let f = both();
    assert!(call(&f, "connect", json!({"provider":"gemini"})).is_err());
    assert!(call(
        &f,
        "connect",
        json!({"provider":"codex","account":"acct-2"})
    )
    .is_err());
    assert!(call(
        &f,
        "remove",
        json!({"provider":"codex","account":"default"})
    )
    .is_err());
    assert!(call(&f, "openOnMac", json!({"provider":"codex"})).is_err());
    assert!(call(&f, "bogus", json!({"provider":"codex"})).is_err());
    assert!(call(
        &f,
        "setDefault",
        json!({"provider":"codex","account":"default"})
    )
    .is_ok());
    assert!(call(&f, "signInUrl", json!({"provider":"codex"})).is_err());
    assert!(call(&f, "submit", json!({"provider":"codex","value":"x"})).is_err());
}
