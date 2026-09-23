use super::*;

#[test]
fn known_levels_survive_normalization() {
    for level in MODES {
        assert_eq!(normalize(level), level);
    }
    assert_eq!(normalize(" Best "), BEST);
}

#[test]
fn unknown_levels_fall_back_to_the_default() {
    assert_eq!(normalize("turbo"), DEFAULT_MODE);
    assert_eq!(normalize(""), DEFAULT_MODE);
}

#[test]
fn the_old_boolean_maps_onto_the_ladder() {
    // `true` asked for every saving at once; `false` was only ever the old
    // default, so it lands on the new one rather than on `full`.
    assert_eq!(from_json(&serde_json::Value::Bool(true)), BEST);
    assert_eq!(from_json(&serde_json::Value::Bool(false)), DEFAULT_MODE);
}

#[test]
fn nonsense_json_is_repaired_rather_than_rejected() {
    // A hard error here would cost the user every other setting in the file.
    assert_eq!(from_json(&serde_json::json!(3)), DEFAULT_MODE);
    assert_eq!(from_json(&serde_json::Value::Null), DEFAULT_MODE);
}

#[test]
fn the_default_is_balanced_and_never_the_top_level() {
    // Best performance changes how the app looks; nobody may arrive there
    // without choosing it.
    assert_eq!(DEFAULT_MODE, BALANCED);
    assert_ne!(DEFAULT_MODE, BEST);
}
