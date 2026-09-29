use super::*;

#[test]
fn roundtrips_through_disk() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("nested").join("settings.json");
    let settings = Settings {
        font_size: 16,
        agent_view: "chat".into(),
        workspace_root: Some("/somewhere".into()),
        enabled_agent_ids: vec!["codex".into()],
        ..Settings::default()
    };
    settings.save_to(&path).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.font_size, 16);
    assert_eq!(loaded.agent_view, "chat");
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
    assert_eq!(loaded.agent_view, "terminal");
    assert!(loaded.persist_terminal_scrollback);
    assert_eq!(loaded.ai_monthly_spend_cap_usd, 20.0);
}

/// The no-migration claim: a settings.json written before notifications
/// existed must load with the whole preference block populated, not with an
/// empty one that would silence the feature on every upgraded install.
#[test]
fn notifications_default_in_for_a_pre_feature_settings_file() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"theme":"light","fontSize":14}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert!(loaded.notifications.enabled);
    assert!(loaded.notifications.sound_enabled);
    assert_eq!(loaded.notifications.categories.len(), 9);
    assert_eq!(loaded.notifications.categories["agentFailed"].cue, "fail");
    // An existing install must gain the update category already reaching the
    // desktop, or the person who upgrades into this feature is the one person
    // who never hears about the next release.
    assert_eq!(
        loaded.notifications.categories["appUpdate"].channel,
        "system"
    );
    assert!((0.0..=1.0).contains(&loaded.notifications.volume));
}

/// Best performance is the only level that changes how the app looks, so no
/// existing install may land there on its own. A pre-feature file resolves to
/// Balanced, which strips nothing visible.
#[test]
fn a_pre_feature_settings_file_lands_on_balanced() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"theme":"dark","rendererMode":"auto"}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.performance_mode, performance::BALANCED);
}

/// The setting used to be a bool. Reading one has to repair that field on its
/// own: `load_from` falls back to defaults for the *whole file* when parsing
/// fails, so a plain type mismatch here would quietly reset every other
/// setting the user had.
#[test]
fn the_old_boolean_migrates_without_costing_other_settings() {
    let tmp = tempfile::tempdir().unwrap();
    for (raw, expected) in [
        ("true", performance::BEST),
        ("false", performance::BALANCED),
    ] {
        let path = tmp.path().join(format!("settings-{raw}.json"));
        std::fs::write(
            &path,
            format!(r#"{{"theme":"light","fontSize":17,"performanceMode":{raw}}}"#),
        )
        .unwrap();
        let loaded = Settings::load_from(&path);
        assert_eq!(loaded.performance_mode, expected);
        assert_eq!(loaded.theme, "light", "{raw} reset the rest of the file");
        assert_eq!(loaded.font_size, 17, "{raw} reset the rest of the file");
    }
}

/// A level this build does not know must not be an error either, for the same
/// reason: repairing one field beats resetting the file.
#[test]
fn an_unknown_level_is_repaired_in_place() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"theme":"light","performanceMode":"turbo"}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.performance_mode, performance::DEFAULT_MODE);
    assert_eq!(loaded.theme, "light");
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

/// A settings.json written before the spoken conversation existed must keep
/// its own bindings and gain a usable one, not an empty string that would
/// register as no shortcut at all.
#[test]
fn the_spoken_conversation_binding_defaults_in_for_an_older_settings_file() {
    let tmp = tempfile::tempdir().unwrap();
    let path = tmp.path().join("settings.json");
    std::fs::write(&path, r#"{"voiceShortcut":"F6","screenshotShortcut":"F7"}"#).unwrap();
    let loaded = Settings::load_from(&path);
    assert_eq!(loaded.voice_shortcut, "F6");
    assert_eq!(loaded.screenshot_shortcut, "F7");
    assert_eq!(loaded.talk_shortcut, "F10");
}
