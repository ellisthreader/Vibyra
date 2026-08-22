//! Notification preferences, persisted as one field inside [`Settings`].
//!
//! Split out of `settings.rs` so that file stays small, and deliberately free
//! of notification *logic*: the core stores and repairs, the renderer decides.
//! The mirror on the other side is `src/lib/notificationPrefs.ts` — the two
//! default tables must stay in step.
//!
//! [`Settings`]: crate::settings::Settings

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Accepted `channel` values. Anything else is a hand-edit or a newer build.
const CHANNELS: [&str; 3] = ["off", "app", "system"];
/// Accepted `cue` values, mirroring `SoundCueId` on the renderer side.
const CUES: [&str; 7] = ["none", "chime", "done", "ask", "fail", "alert", "blip"];

/// The categories this build knows about, as `(id, channel, cue)`.
const DEFAULTS: [(&str, &str, &str); 8] = [
    ("agentAttention", "system", "ask"),
    ("agentDone", "system", "done"),
    ("agentFailed", "system", "fail"),
    ("aiSpend", "system", "alert"),
    ("preview", "app", "none"),
    ("models", "app", "none"),
    ("performance", "app", "none"),
    ("system", "app", "fail"),
];

/// Half volume: audible over a fan, quiet enough not to startle. Must equal
/// `DEFAULT_NOTIFICATIONS.volume` in `notificationPrefs.ts`.
const DEFAULT_VOLUME: f64 = 0.5;

/// Where one category is allowed to surface, and what it sounds like.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NotificationCategoryPrefs {
    /// "off" | "app" | "system". One three-way value rather than two booleans,
    /// so the Settings row is a single segmented control.
    pub channel: String,
    /// A `SoundCueId`; "none" is silence.
    pub cue: String,
}

impl Default for NotificationCategoryPrefs {
    fn default() -> Self {
        Self {
            channel: "app".to_string(),
            cue: "none".to_string(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NotificationPrefs {
    /// Master switch. Off silences toasts, sounds and system notifications.
    pub enabled: bool,
    pub sound_enabled: bool,
    /// 0.0..=1.0.
    pub volume: f64,
    pub os_enabled: bool,
    pub os_only_when_away: bool,
    /// "Also tell me when a long-running agent goes quiet" — off by default,
    /// because it is the one trigger that can fire while nothing has happened.
    pub agent_idle_enabled: bool,
    /// A map, not a struct of eight fields. With a struct, a category a future
    /// build renames or adds is silently dropped on the first save an older
    /// build makes; with a map, unknown keys survive the round-trip in both
    /// directions — which is the whole reason this file needs no migration.
    pub categories: BTreeMap<String, NotificationCategoryPrefs>,
}

impl Default for NotificationPrefs {
    fn default() -> Self {
        Self {
            enabled: true,
            sound_enabled: true,
            volume: DEFAULT_VOLUME,
            os_enabled: true,
            os_only_when_away: true,
            agent_idle_enabled: false,
            categories: DEFAULTS
                .iter()
                .map(|(id, channel, cue)| ((*id).to_string(), category(channel, cue)))
                .collect(),
        }
    }
}

fn category(channel: &str, cue: &str) -> NotificationCategoryPrefs {
    NotificationCategoryPrefs {
        channel: channel.to_string(),
        cue: cue.to_string(),
    }
}

impl NotificationPrefs {
    /// Repairs a hand-edited, truncated or downgraded `settings.json`.
    ///
    /// `volume` is clamped, and NaN is replaced rather than clamped: NaN
    /// survives `clamp` on some paths and then poisons every later comparison
    /// as silently-false, so a slider that reads "half" would be mute forever.
    /// Unknown `channel`/`cue` values are coerced to something the renderer can
    /// actually render, and any known category that went missing is restored.
    /// Unknown category keys are left exactly as found — see `categories`.
    pub fn sanitize(&mut self) {
        self.volume = if self.volume.is_finite() {
            self.volume.clamp(0.0, 1.0)
        } else {
            DEFAULT_VOLUME
        };
        for prefs in self.categories.values_mut() {
            if !CHANNELS.contains(&prefs.channel.as_str()) {
                prefs.channel = "app".to_string();
            }
            if !CUES.contains(&prefs.cue.as_str()) {
                prefs.cue = "none".to_string();
            }
        }
        for (id, channel, cue) in DEFAULTS {
            self.categories
                .entry(id.to_string())
                .or_insert_with(|| category(channel, cue));
        }
    }
}

#[cfg(test)]
#[path = "notifications_tests.rs"]
mod tests;
