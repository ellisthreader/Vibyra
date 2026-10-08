use super::*;
use crate::settings::Settings;

#[test]
fn defaults_follow_the_account_and_stay_private() {
    let s = CloudSyncSettings::default();
    assert!(!s.paused && s.enabled && s.include_conversations);
    assert!(!s.include_env && !s.auto_apply_safe && !s.share_codex_login);
    assert_eq!(s.consent_version, 0);
    assert!(s.needs_consent() && !s.active());
}

#[test]
fn pausing_wins_and_a_new_text_asks_a_consented_user_again() {
    let mut paused = CloudSyncSettings::default();
    paused.set_paused(true);
    assert!(paused.paused && !paused.enabled);
    assert!(!paused.needs_consent() && !paused.active());
    let old = CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION - 1,
        ..Default::default()
    };
    assert!(old.needs_consent());
    let agreed = CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION,
        ..Default::default()
    };
    assert!(agreed.active() && !agreed.needs_consent());
}

#[test]
fn project_switch_round_trips_without_duplicates() {
    let mut s = CloudSyncSettings::default();
    s.set_project("a", false);
    s.set_project("a", false);
    assert_eq!(s.disabled_project_ids, vec!["a"]);
    assert!(!s.project_enabled("a") && s.project_enabled("b"));
    s.set_project("a", true);
    assert!(s.disabled_project_ids.is_empty());
}

#[test]
fn an_older_settings_file_loads_with_the_defaults_and_keeps_new_fields() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"theme":"light"}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.cloud_sync, CloudSyncSettings::default());
    // A partial block keeps its own fields and defaults the rest.
    std::fs::write(
        &path,
        r#"{"cloudSync":{"consentVersion":1,"includeEnv":true,"enabled":true}}"#,
    )
    .unwrap();
    let loaded = Settings::load_from(&path);
    assert!(loaded.cloud_sync.include_env && !loaded.cloud_sync.paused);
    assert_eq!(loaded.cloud_sync.consent_version, 1);
    loaded.save_to(&path).unwrap();
    assert_eq!(Settings::load_from(&path).cloud_sync, loaded.cloud_sync);
    let saved: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&path).unwrap()).unwrap();
    assert_eq!(saved["cloudSync"]["paused"], serde_json::json!(false));
}

#[test]
fn a_file_without_paused_is_read_from_the_switch_it_replaces() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    let paused = |json: &str| {
        std::fs::write(&path, json).unwrap();
        Settings::load_from(&path).cloud_sync.paused
    };
    // Never touched on this Mac (the owner's case): follows the account, so the iPhone agreement is enough.
    assert!(!paused(
        r#"{"cloudSync":{"enabled":false,"consentVersion":0}}"#
    ));
    assert!(!paused(
        r#"{"cloudSync":{"enabled":true,"consentVersion":0}}"#
    ));
    // Agreed here and switched on: keeps syncing.
    assert!(!paused(
        r#"{"cloudSync":{"enabled":true,"consentVersion":1}}"#
    ));
    // Agreed here and then switched off: stays off.
    assert!(paused(
        r#"{"cloudSync":{"enabled":false,"consentVersion":1}}"#
    ));
    // Once stored, `paused` is what counts.
    assert!(!paused(
        r#"{"cloudSync":{"enabled":false,"consentVersion":1,"paused":false}}"#
    ));
    assert!(paused(
        r#"{"cloudSync":{"enabled":true,"consentVersion":0,"paused":true}}"#
    ));
    let loaded = Settings::load_from(&path).cloud_sync;
    assert!(!loaded.enabled, "enabled follows paused for older readers");
}

#[test]
fn sharing_the_codex_login_is_off_by_default_and_a_general_consent_never_turns_it_on() {
    let agreed = CloudSyncSettings {
        consent_version: CLOUD_SYNC_CONSENT_VERSION,
        ..Default::default()
    };
    assert!(agreed.active() && !agreed.share_codex_login);
    // An older file (with or without a cloudSync block) loads with it off; a stored true survives a round trip.
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(
        &path,
        r#"{"cloudSync":{"consentVersion":1,"enabled":true}}"#,
    )
    .unwrap();
    assert!(!Settings::load_from(&path).cloud_sync.share_codex_login);
    std::fs::write(&path, r#"{"cloudSync":{"shareCodexLogin":true}}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert!(loaded.cloud_sync.share_codex_login);
    loaded.save_to(&path).unwrap();
    assert!(Settings::load_from(&path).cloud_sync.share_codex_login);
    // Nothing in the file but the flag: the login itself is never stored here.
    assert!(!std::fs::read_to_string(&path).unwrap().contains("token"));
}
