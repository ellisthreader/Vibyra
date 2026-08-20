use super::*;

#[test]
fn roundtrips_through_disk() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("nested").join("settings.json");
    let settings = Settings {
        font_size: 16,
        workspace_root: Some("/somewhere".into()),
        enabled_agent_ids: vec!["codex".into()],
        ..Settings::default()
    };
    settings.save_to(&path).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.font_size, 16);
    assert_eq!(loaded.workspace_root.as_deref(), Some("/somewhere"));
    assert_eq!(loaded.voice_shortcut, "F8");
    assert_eq!(loaded.screenshot_shortcut, "F9");
    assert_eq!(loaded.enabled_agent_ids, vec!["codex"]);
    assert_eq!(loaded.ai_daily_call_cap, 250);
    assert_eq!(loaded.ai_daily_spend_cap_usd, 2.0);
}

/// A screenshot is what is on screen by default; hiding Vibyra is opt-in, and
/// a settings file written before the toggle existed must land on "included".
#[test]
fn screenshots_include_the_vibyra_window_unless_asked_otherwise() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"fontSize":13}"#).unwrap();
    assert!(!Settings::load_from(&path).screenshot_hide_window);

    let settings = Settings {
        screenshot_hide_window: true,
        ..Settings::default()
    };
    settings.save_to(&path).unwrap();
    assert!(Settings::load_from(&path).screenshot_hide_window);
}

#[test]
fn spend_caps_default_in_when_absent_from_an_older_settings_file() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"theme":"light"}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.ai_hourly_call_cap, 60);
    assert!(loaded.persist_terminal_scrollback);
    assert_eq!(loaded.ai_monthly_spend_cap_usd, 20.0);
}

#[test]
fn corrupt_file_falls_back_to_defaults() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, "{not json").unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.theme, "dark");
}

#[test]
fn legacy_secret_is_read_but_not_serialized_after_migration() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"theme":"light","openaiApiKey":"sk-legacy"}"#).unwrap();
    let mut loaded = Settings::load_from(&path);
    assert_eq!(loaded.legacy_openai_api_key.as_deref(), Some("sk-legacy"));
    loaded.legacy_openai_api_key = None;
    loaded.save_to(&path).unwrap();
    assert!(!std::fs::read_to_string(path).unwrap().contains("sk-legacy"));
}

#[cfg(unix)]
#[test]
fn settings_file_is_owner_only() {
    use std::os::unix::fs::PermissionsExt;

    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    Settings::default().save_to(&path).unwrap();
    assert_eq!(path.metadata().unwrap().permissions().mode() & 0o777, 0o600);
}
