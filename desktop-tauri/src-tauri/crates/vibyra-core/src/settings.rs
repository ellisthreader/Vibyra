use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::agents::AgentSpec;
use crate::error::{CoreError, CoreResult};
use crate::fsx::{harden, write_private_atomic};
use crate::notifications::NotificationPrefs;

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
    /// WebKit compositing policy: "auto", "accelerated", or "compatibility".
    /// Linux only; read at startup before the webview exists, so a change
    /// takes effect on the next launch. See `renderer.rs` in the app crate.
    pub renderer_mode: String,
    /// One-shot marker for the startup repair of an NVIDIA session left on
    /// "accelerated" by the pre-0.2.5 promotion offer. Once true, an explicit
    /// "accelerated" choice is the user's own and is never rewritten again.
    pub renderer_accel_heal_done: bool,
    /// Skip decorative animation and the sign-in backdrop video, independent
    /// of the OS-level reduced-motion preference.
    pub reduce_motion: bool,
    /// "standard" runs everything; "max" temporarily disables the
    /// nonessentials — animation, notifications, sounds, visual effects.
    /// Only the frontend interprets it; unknown values read as "standard".
    pub performance_mode: String,
    /// AI CLI integrations explicitly enabled for terminal model selection.
    pub enabled_agent_ids: Vec<String>,
    /// Which login each company's terminals run as, by provider id. Absent
    /// means the CLI's own folder — the account every install already had.
    ///
    /// Persisted because a switch has to outlive the panes it moved: opening a
    /// new terminal after changing account must not quietly reach for the old
    /// one's credits. Sorted so the settings file stays diffable.
    pub active_provider_accounts: BTreeMap<String, String>,
    /// Spend guardrails for the user's own OpenAI key, enforced before every
    /// billed call. Zero disables that particular cap.
    pub ai_daily_call_cap: u32,
    pub ai_hourly_call_cap: u32,
    pub ai_daily_spend_cap_usd: f64,
    pub ai_monthly_spend_cap_usd: f64,
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
            renderer_mode: "auto".to_string(),
            renderer_accel_heal_done: false,
            reduce_motion: false,
            performance_mode: "standard".to_string(),
            enabled_agent_ids: Vec::new(),
            active_provider_accounts: BTreeMap::new(),
            ai_daily_call_cap: 250,
            ai_hourly_call_cap: 60,
            ai_daily_spend_cap_usd: 2.0,
            ai_monthly_spend_cap_usd: 20.0,
            persist_terminal_scrollback: true,
            notifications: NotificationPrefs::default(),
            custom_agents: Vec::new(),
            projects: Vec::new(),
            active_project_id: None,
        }
    }
}

impl Settings {
    pub fn default_path() -> PathBuf {
        dirs::config_dir()
            .unwrap_or_else(std::env::temp_dir)
            .join("vibyra-desktop")
            .join("settings.json")
    }

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

#[cfg(test)]
#[path = "settings_tests.rs"]
mod tests;
