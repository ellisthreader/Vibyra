use super::*;

fn prefs_of(json: &str) -> NotificationPrefs {
    let mut prefs = serde_json::from_str::<NotificationPrefs>(json).unwrap();
    prefs.sanitize();
    prefs
}

#[test]
fn defaults_seed_every_known_kind() {
    let prefs = NotificationPrefs::default();
    assert_eq!(prefs.kinds.len(), DEFAULTS.len());
    for (id, channel, cue) in DEFAULTS {
        let entry = prefs.kinds.get(id).expect(id);
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
        "kinds",
    ] {
        assert!(object.contains_key(key), "missing {key}");
    }
    assert_eq!(object.len(), 7);
    assert_eq!(value["kinds"]["agent"]["cue"], "done");
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
    let prefs = prefs_of(r#"{"kinds":{"agent":{"channel":"pager","cue":"foghorn"}}}"#);
    let entry = &prefs.kinds["agent"];
    assert_eq!(entry.channel, "app");
    assert_eq!(entry.cue, "none");
}

#[test]
fn a_missing_kind_is_restored_without_disturbing_the_others() {
    let prefs = prefs_of(r#"{"kinds":{"agent":{"channel":"off","cue":"blip"}}}"#);
    assert_eq!(prefs.kinds.len(), DEFAULTS.len());
    assert_eq!(prefs.kinds["agent"].channel, "off");
    assert_eq!(prefs.kinds["preview"].channel, "app");
}

/// The reason `kinds` is a map: a newer build's kind must come back out of an
/// older build untouched.
#[test]
fn unknown_kind_keys_survive_a_round_trip() {
    let prefs = prefs_of(r#"{"kinds":{"quantumFlux":{"channel":"system","cue":"chime"}}}"#);
    let raw = serde_json::to_string(&prefs).unwrap();
    let back = serde_json::from_str::<NotificationPrefs>(&raw).unwrap();
    let entry = back.kinds.get("quantumFlux").expect("unknown key kept");
    assert_eq!(entry.channel, "system");
    assert_eq!(entry.cue, "chime");
}

/// A settings file written before the tier/kind split keeps the choices its
/// owner made, under the names this build uses.
#[test]
fn a_pre_split_file_is_migrated_key_by_key() {
    let prefs = prefs_of(
        r#"{"categories":{
            "agentAttention":{"channel":"app","cue":"blip"},
            "agentDone":{"channel":"off","cue":"chime"},
            "aiSpend":{"channel":"off","cue":"alert"},
            "system":{"channel":"system","cue":"fail"}
        }}"#,
    );
    assert_eq!(
        prefs.kinds["approval"].cue, "blip",
        "agentAttention -> approval"
    );
    assert_eq!(prefs.kinds["agent"].channel, "off", "agentDone -> agent");
    assert_eq!(prefs.kinds["spend"].channel, "off", "aiSpend -> spend");
    assert_eq!(prefs.kinds["app"].channel, "system", "system -> app");
    // The old names are gone, not carried alongside the new ones.
    assert_eq!(prefs.kinds.len(), DEFAULTS.len());
    for legacy in ["agentAttention", "agentDone", "aiSpend", "system"] {
        assert!(!prefs.kinds.contains_key(legacy), "{legacy} still present");
    }
}

/// Two legacy keys map onto `agent`; the earlier one in `LEGACY` wins rather
/// than the map's iteration order deciding it.
#[test]
fn the_first_legacy_key_settles_a_shared_target() {
    let prefs = prefs_of(
        r#"{"categories":{
            "agentDone":{"channel":"off","cue":"chime"},
            "agentFailed":{"channel":"system","cue":"fail"}
        }}"#,
    );
    assert_eq!(prefs.kinds["agent"].cue, "chime");
}

#[test]
fn an_empty_object_still_sanitizes_to_something_usable() {
    let prefs = prefs_of("{}");
    assert!(prefs.enabled);
    assert_eq!(prefs.volume, DEFAULT_VOLUME);
    assert_eq!(prefs.kinds.len(), DEFAULTS.len());
}
