//! The Performance level a settings.json may hold, and how to read one safely.
//!
//! Three levels rather than a switch, mirroring `lib/performanceMode.ts`:
//! `full` holds nothing back, `balanced` stops work nobody can see, and
//! `best` also stops the interface spending on looks. Rust only stores and
//! repairs the value; every behaviour it gates lives in the frontend.
//!
//! This is *not* `renderer_mode`. That one picks a Linux WebKit compositing
//! path, is read before the webview exists, and decides whether xterm gets the
//! WebGL renderer. The two must never be wired together — terminal panes once
//! rendered black because WebGL loaded but never composited, and the fix was
//! to leave that decision to `renderer.rs` alone.

use serde::{Deserialize, Deserializer};

pub const FULL: &str = "full";
pub const BALANCED: &str = "balanced";
pub const BEST: &str = "best";

/// Balanced rather than Full: at this level nothing on screen changes, so the
/// saving costs the user nothing. A Mac that never touched the setting is here.
pub const DEFAULT_MODE: &str = BALANCED;

pub const MODES: [&str; 3] = [FULL, BALANCED, BEST];

/// `Settings::default()` and the serde container default both use this.
pub fn default_mode() -> String {
    DEFAULT_MODE.to_string()
}

/// Anything unrecognised becomes the default rather than an error: a
/// hand-edited or newer settings.json must never cost the user every *other*
/// setting, which is what a hard failure would do — `Settings::load_from`
/// falls back to defaults for the whole file when parsing fails.
pub fn normalize(value: &str) -> String {
    let level = value.trim().to_ascii_lowercase();
    if MODES.contains(&level.as_str()) {
        level
    } else {
        default_mode()
    }
}

/// Reads the level from a JSON value, including the boolean this setting used
/// to be. `true` meant every saving at once, which is now `best`. `false` was
/// only ever the old default — nobody chose it — so it lands on the new
/// default, which is safe because Balanced changes nothing that can be seen.
/// `normalizePerformanceMode` in `performanceMode.ts` does the same.
pub fn from_json(value: &serde_json::Value) -> String {
    match value {
        serde_json::Value::Bool(true) => BEST.to_string(),
        serde_json::Value::String(level) => normalize(level),
        _ => default_mode(),
    }
}

/// Field-level `deserialize_with` for `Settings::performance_mode`. Goes via
/// `Value` so a bool, a number or a null is repaired in place; typing the
/// field as `String` alone would make an old file a parse error, and that
/// error would reset every setting in it.
pub fn deserialize<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(from_json(&serde_json::Value::deserialize(deserializer)?))
}

#[cfg(test)]
#[path = "performance_tests.rs"]
mod tests;
