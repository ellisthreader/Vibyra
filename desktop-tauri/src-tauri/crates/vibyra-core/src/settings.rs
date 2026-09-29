use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::agents::AgentSpec;
use crate::error::{CoreError, CoreResult};
use crate::fsx::{harden, write_private_atomic};
use crate::notifications::NotificationPrefs;
use crate::performance;

/// A folder the user works in; the unit terminals/memory/chat hang off.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ProjectSpec {
    pub id: String,
    pub name: String,
    pub root: String,
    pub color: String,
    pub last_opened_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct Settings {
    pub theme: String,
    /// Desktop presentation only; never changes the shared engine or phone view.
    pub agent_view: String,
    pub font_size: u16,
    pub font_family: String,
    pub scrollback_lines: u32,
    pub default_shell: Option<String>,
    pub workspace_root: Option<String>,
    /// Where F9 screenshots are saved; defaults to ~/Pictures/Vibyra.
    pub screenshot_dir: Option<String>,
    /// Ask the compositor to hide Vibyra for the length of the grab. Off by
    /// default: a screenshot should be what is on screen, Vibyra included.
    pub screenshot_hide_window: bool,
    /// Read only for one-time migration into the operating-system credential store.
    #[serde(skip)]
    pub legacy_openai_api_key: Option<String>,
    /// System-wide push-to-talk binding. Defaults to F8.
    pub voice_shortcut: String,
    /// System-wide screenshot binding. Defaults to F9.
    pub screenshot_shortcut: String,
    /// System-wide binding that opens a spoken conversation with the workspace
    /// assistant. Defaults to F10.
    pub talk_shortcut: String,
    /// Which of Vibyra's own voices reads replies aloud. Empty is the default
    /// voice; the allowed set lives in `speech_synthesis.rs`.
    pub speech_voice: String,
    /// How fast that voice reads, as a multiplier of its natural pace. 1.0 is
    /// unchanged; the synthesiser clamps anything outside 0.25–4.0.
    pub speech_rate: f32,
    /// A sentence steering delivery — "warm and unhurried", "brisk and
    /// factual". Empty leaves the voice as it comes. Sent as the speech
    /// model's `instructions`, which is also what actually moves its pace.
    pub speech_style: String,
    /// ISO-639-1 code telling dictation what language to expect, which is
    /// faster and more accurate than letting it guess. Empty means guess.
    pub voice_language: String,
    /// How long a pause ends your turn in a spoken conversation, in
    /// milliseconds. Shorter cuts people off; longer feels unresponsive.
    pub talk_pause_ms: u32,
    /// WebKit compositing policy: "auto", "accelerated", or "compatibility".
    /// Linux only; read at startup before the webview exists, so a change
    /// takes effect on the next launch. See `renderer.rs` in the app crate.
    pub renderer_mode: String,
    /// AI CLI integrations explicitly enabled for terminal model selection.
    pub enabled_agent_ids: Vec<String>,
    /// Spend guardrails for the user's own OpenAI key, enforced before every
    /// billed call. Zero disables that particular cap.
    pub ai_daily_call_cap: u32,
    pub ai_hourly_call_cap: u32,
    pub ai_daily_spend_cap_usd: f64,
    pub ai_monthly_spend_cap_usd: f64,
    /// Whether the workspace assistant is told what this project actually is
    /// — branch, changed files, stack, open terminals. On by default; off
    /// leaves it only the name and path, so it answers blind rather than
    /// sending a folder listing to OpenAI.
    pub send_project_context: bool,
    /// How much work the desktop does to look good: "full", "balanced" or
    /// "best", a ladder rather than a switch. Cross-platform, applies without
    /// a restart, and independent of `renderer_mode`, which only picks a Linux
    /// compositing path. Was a bool; `performance::deserialize` still reads
    /// one. See `performance.rs` and `performanceMode.ts`.
    #[serde(deserialize_with = "performance::deserialize")]
    pub performance_mode: String,
    /// Whether a restored terminal keeps its previous on-screen output. Off
    /// means only the layout is saved — no terminal text ever reaches disk.
    pub persist_terminal_scrollback: bool,
    /// Toasts, sounds and system notifications. One nested object rather than a
    /// dozen flat fields; see `notifications.rs` for why it needs no migration.
    pub notifications: NotificationPrefs,
    pub custom_agents: Vec<AgentSpec>,
    pub projects: Vec<ProjectSpec>,
    pub active_project_id: Option<String>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            agent_view: "terminal".to_string(),
            font_size: 13,
            font_family: "\"JetBrains Mono\", \"Fira Code\", monospace".to_string(),
            scrollback_lines: 5000,
            default_shell: None,
            workspace_root: None,
            screenshot_dir: None,
            screenshot_hide_window: false,
            legacy_openai_api_key: None,
            voice_shortcut: "F8".to_string(),
            screenshot_shortcut: "F9".to_string(),
            talk_shortcut: "F10".to_string(),
            speech_voice: String::new(),
            speech_rate: 1.0,
            speech_style: String::new(),
            voice_language: String::new(),
            talk_pause_ms: 1_100,
            renderer_mode: "auto".to_string(),
            enabled_agent_ids: Vec::new(),
            ai_daily_call_cap: 250,
            ai_hourly_call_cap: 60,
            ai_daily_spend_cap_usd: 2.0,
            ai_monthly_spend_cap_usd: 20.0,
            send_project_context: true,
            performance_mode: performance::default_mode(),
            persist_terminal_scrollback: true,
            notifications: NotificationPrefs::default(),
            custom_agents: Vec::new(),
            projects: Vec::new(),
            active_project_id: None,
        }
    }
}

impl Settings {
    /// Loads settings, falling back to defaults on missing or corrupt file
    /// so a bad settings.json can never brick the app.
    pub fn load_from(path: &Path) -> Self {
        harden(path);
        let Some(raw) = std::fs::read_to_string(path).ok() else {
            return Self::default();
        };
        let mut settings = serde_json::from_str::<Self>(&raw).unwrap_or_default();
        // Repair rather than reject: a bad volume or an unknown cue in a
        // hand-edited file must not cost the user every other setting.
        settings.notifications.sanitize();
        settings.legacy_openai_api_key = serde_json::from_str::<serde_json::Value>(&raw)
            .ok()
            .and_then(|value| {
                value
                    .get("openaiApiKey")
                    .and_then(|key| key.as_str())
                    .map(str::to_owned)
            })
            .filter(|key| !key.trim().is_empty());
        settings
    }

    pub fn save_to(&self, path: &Path) -> CoreResult<()> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut value =
            serde_json::to_value(self).map_err(|error| CoreError::Settings(error.to_string()))?;
        if let (Some(object), Some(key)) = (value.as_object_mut(), &self.legacy_openai_api_key) {
            object.insert(
                "openaiApiKey".into(),
                serde_json::Value::String(key.clone()),
            );
        }
        let raw = serde_json::to_vec_pretty(&value)
            .map_err(|error| CoreError::Settings(error.to_string()))?;
        write_private_atomic(path, &raw)
    }
}

#[path = "settings_location.rs"]
mod location;

#[cfg(test)]
#[path = "settings_tests.rs"]
mod tests;
