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

/// The kinds this build knows about, as `(id, channel, cue)`.
const DEFAULTS: [(&str, &str, &str); 10] = [
    ("approval", "system", "ask"),
    ("agent", "system", "done"),
    ("update", "system", "chime"),
    ("account", "system", "alert"),
    ("spend", "system", "alert"),
    ("preview", "app", "none"),
    ("performance", "app", "none"),
    ("project", "app", "none"),
    ("models", "app", "none"),
    ("app", "app", "fail"),
];

/// Where a file written before the tier/kind split lands, as `(was, is)`.
///
/// The three agent categories encoded an *outcome*, which is now the tier, so
/// two of them collapse onto `agent`; the third was only ever raised for a
/// permission prompt and becomes `approval`. Order is the precedence: the
/// first legacy key present settles its target and later ones are dropped.
/// Mirrored by `LEGACY_KINDS` in `notificationPrefs.ts`.
const LEGACY: [(&str, &str); 5] = [
    ("agentAttention", "approval"),
    ("agentDone", "agent"),
    ("agentFailed", "agent"),
    ("aiSpend", "spend"),
    ("system", "app"),
];

/// Half volume: audible over a fan, quiet enough not to startle. Must equal
/// `DEFAULT_NOTIFICATIONS.volume` in `notificationPrefs.ts`.
const DEFAULT_VOLUME: f64 = 0.5;

/// Where one kind is allowed to surface, and what it sounds like.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct NotificationKindPrefs {
    /// "off" | "app" | "system". One three-way value rather than two booleans,
    /// so the Settings row is a single segmented control.
    pub channel: String,
    /// A `SoundCueId`; "none" is silence.
    pub cue: String,
}

impl Default for NotificationKindPrefs {
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
    /// A map, not a struct of ten fields. With a struct, a kind a future build
    /// renames or adds is silently dropped on the first save an older build
    /// makes; with a map, unknown keys survive the round-trip in both
    /// directions. The alias reads a pre-split file's `categories` into the
    /// same field, which `sanitize` then renames key by key.
    #[serde(alias = "categories")]
    pub kinds: BTreeMap<String, NotificationKindPrefs>,
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
            kinds: DEFAULTS
                .iter()
                .map(|(id, channel, cue)| ((*id).to_string(), kind(channel, cue)))
                .collect(),
        }
    }
}

fn kind(channel: &str, cue: &str) -> NotificationKindPrefs {
    NotificationKindPrefs {
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
    /// actually render, and any known kind that went missing is restored.
    /// Pre-split keys are renamed; genuinely unknown keys are left exactly as
    /// found — see `kinds`.
    pub fn sanitize(&mut self) {
        self.volume = if self.volume.is_finite() {
            self.volume.clamp(0.0, 1.0)
        } else {
            DEFAULT_VOLUME
        };
        self.migrate_legacy();
        for prefs in self.kinds.values_mut() {
            if !CHANNELS.contains(&prefs.channel.as_str()) {
                prefs.channel = "app".to_string();
            }
            if !CUES.contains(&prefs.cue.as_str()) {
                prefs.cue = "none".to_string();
            }
        }
        for (id, channel, cue) in DEFAULTS {
            self.kinds
                .entry(id.to_string())
                .or_insert_with(|| kind(channel, cue));
        }
    }

    /// Moves a pre-split key onto its new home and removes it. Runs before the
    /// defaults are filled in, so a migrated value is never overwritten by one.
    fn migrate_legacy(&mut self) {
        for (was, is) in LEGACY {
            let Some(prefs) = self.kinds.remove(was) else {
                continue;
            };
            self.kinds.entry(is.to_string()).or_insert(prefs);
        }
    }
}

#[cfg(test)]
#[path = "notifications_tests.rs"]
mod tests;
