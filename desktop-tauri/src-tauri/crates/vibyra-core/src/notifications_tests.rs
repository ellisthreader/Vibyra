use super::*;

fn prefs_of(json: &str) -> NotificationPrefs {
    let mut prefs = serde_json::from_str::<NotificationPrefs>(json).unwrap();
    prefs.sanitize();
    prefs
}

#[test]
fn defaults_seed_every_known_category() {
    let prefs = NotificationPrefs::default();
    assert_eq!(prefs.categories.len(), DEFAULTS.len());
    for (id, channel, cue) in DEFAULTS {
        let entry = prefs.categories.get(id).expect(id);
        assert_eq!(entry.channel, channel, "channel for {id}");
        assert_eq!(entry.cue, cue, "cue for {id}");
    }
    assert!(prefs.enabled);
    assert!(prefs.os_only_when_away);
    // The one trigger that fires when nothing happened stays opt-in.
    assert!(!prefs.agent_idle_enabled);
}

#[test]
fn serialises_camel_case_for_the_renderer_contract() {
    let value = serde_json::to_value(NotificationPrefs::default()).unwrap();
    let object = value.as_object().unwrap();
    for key in [
        "enabled",
        "soundEnabled",
        "volume",
        "osEnabled",
        "osOnlyWhenAway",
        "agentIdleEnabled",
        "categories",
    ] {
        assert!(object.contains_key(key), "missing {key}");
    }
    assert_eq!(object.len(), 7);
    assert_eq!(value["categories"]["agentDone"]["cue"], "done");
}

#[test]
fn volume_is_clamped_and_nan_is_rejected() {
    assert_eq!(prefs_of(r#"{"volume":-1.0}"#).volume, 0.0);
    assert_eq!(prefs_of(r#"{"volume":2.5}"#).volume, 1.0);
    assert_eq!(prefs_of(r#"{"volume":0.25}"#).volume, 0.25);

    // JSON has no NaN literal, so this is the in-memory path a bad update takes.
    let mut prefs = NotificationPrefs {
        volume: f64::NAN,
        ..NotificationPrefs::default()
    };
    prefs.sanitize();
    assert_eq!(prefs.volume, DEFAULT_VOLUME);
}

#[test]
fn unknown_channel_and_cue_are_coerced() {
    let prefs = prefs_of(r#"{"categories":{"agentDone":{"channel":"pager","cue":"foghorn"}}}"#);
    let entry = &prefs.categories["agentDone"];
    assert_eq!(entry.channel, "app");
    assert_eq!(entry.cue, "none");
}

#[test]
fn a_missing_category_is_restored_without_disturbing_the_others() {
    let prefs = prefs_of(r#"{"categories":{"agentDone":{"channel":"off","cue":"blip"}}}"#);
    assert_eq!(prefs.categories.len(), DEFAULTS.len());
    assert_eq!(prefs.categories["agentDone"].channel, "off");
    assert_eq!(prefs.categories["preview"].channel, "app");
}

/// The reason `categories` is a map: a newer build's category must come back
/// out of an older build untouched.
#[test]
fn unknown_category_keys_survive_a_round_trip() {
    let prefs = prefs_of(r#"{"categories":{"quantumFlux":{"channel":"system","cue":"chime"}}}"#);
    let raw = serde_json::to_string(&prefs).unwrap();
    let back = serde_json::from_str::<NotificationPrefs>(&raw).unwrap();
    let entry = back
        .categories
        .get("quantumFlux")
        .expect("unknown key kept");
    assert_eq!(entry.channel, "system");
    assert_eq!(entry.cue, "chime");
}

#[test]
fn an_empty_object_still_sanitizes_to_something_usable() {
    let prefs = prefs_of("{}");
    assert!(prefs.enabled);
    assert_eq!(prefs.volume, DEFAULT_VOLUME);
    assert_eq!(prefs.categories.len(), DEFAULTS.len());
}
