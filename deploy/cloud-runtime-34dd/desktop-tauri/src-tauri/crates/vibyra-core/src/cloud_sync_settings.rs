//! Cloud sync preferences, persisted as one field inside [`Settings`].
//!
//! Nothing secret lives here: the device key stays in the sync state dir
//! (`vibyra-sync`), and the account token in the session store. The renderer
//! never writes this block through `save_settings`; the cloud sync commands own
//! it, so a stale settings snapshot cannot undo a consent or a switch.
//!
//! [`Settings`]: crate::settings::Settings

use serde::{Deserialize, Serialize};

/// Bumped whenever the plain-language consent text changes. A user who agreed
/// to an older text is asked again before anything more is uploaded.
pub const CLOUD_SYNC_CONSENT_VERSION: u32 = 1;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct CloudSyncSettings {
    /// "Keep my projects ready in the cloud". On by default, but nothing runs
    /// until `consent_version` has caught up with [`CLOUD_SYNC_CONSENT_VERSION`].
    pub enabled: bool,
    /// The consent text the user last agreed to; 0 means never asked.
    pub consent_version: u32,
    /// Also send this project's Claude and Codex conversations.
    pub include_conversations: bool,
    /// Also send `.env` files (private keys and tokens are never sent).
    pub include_env: bool,
    /// Write cloud changes into the project without a review when no file the
    /// cloud touched has changed on this Mac since the last upload.
    pub auto_apply_safe: bool,
    /// Projects the user switched off, by project id.
    pub disabled_project_ids: Vec<String>,
    /// "Use my Codex login in the cloud": the separate opt-in that carries `~/.codex/auth.json` to the cloud
    /// computer. Off by default and never switched on by the general consent; only the explicit command that
    /// follows its own consent dialog sets it.
    pub share_codex_login: bool,
}

impl Default for CloudSyncSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            consent_version: 0,
            include_conversations: true,
            include_env: false,
            auto_apply_safe: false,
            disabled_project_ids: Vec::new(),
            share_codex_login: false,
        }
    }
}

impl CloudSyncSettings {
    /// True once the user agreed to the current text.
    pub fn consented(&self) -> bool {
        self.consent_version >= CLOUD_SYNC_CONSENT_VERSION
    }

    /// Whether anything may be uploaded at all (consent given and the switch on).
    pub fn active(&self) -> bool {
        self.enabled && self.consented()
    }

    /// Whether the one-time consent dialog is due: the switch is on but the
    /// current text has not been agreed to. "Not now" turns the switch off, so
    /// a declined user is never asked again except from Settings.
    pub fn needs_consent(&self) -> bool {
        self.enabled && !self.consented()
    }

    pub fn project_enabled(&self, project_id: &str) -> bool {
        !self.disabled_project_ids.iter().any(|id| id == project_id)
    }

    pub fn set_project(&mut self, project_id: &str, on: bool) {
        self.disabled_project_ids.retain(|id| id != project_id);
        if !on {
            self.disabled_project_ids.push(project_id.to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::Settings;

    #[test]
    fn defaults_are_on_but_unconsented_and_private() {
        let s = CloudSyncSettings::default();
        assert!(s.enabled && s.include_conversations);
        assert!(!s.include_env && !s.auto_apply_safe && !s.share_codex_login);
        assert_eq!(s.consent_version, 0);
        assert!(s.needs_consent() && !s.active());
    }

    #[test]
    fn declining_never_asks_again_and_a_new_text_asks_a_consented_user_again() {
        let declined = CloudSyncSettings {
            enabled: false,
            ..Default::default()
        };
        assert!(!declined.needs_consent() && !declined.active());
        let old = CloudSyncSettings {
            consent_version: CLOUD_SYNC_CONSENT_VERSION - 1,
            ..Default::default()
        };
        assert!(old.needs_consent());
        let agreed = CloudSyncSettings {
            consent_version: CLOUD_SYNC_CONSENT_VERSION,
            ..Default::default()
        };
        assert!(agreed.active() && !agreed.needs_consent());
    }

    #[test]
    fn project_switch_round_trips_without_duplicates() {
        let mut s = CloudSyncSettings::default();
        s.set_project("a", false);
        s.set_project("a", false);
        assert_eq!(s.disabled_project_ids, vec!["a"]);
        assert!(!s.project_enabled("a") && s.project_enabled("b"));
        s.set_project("a", true);
        assert!(s.disabled_project_ids.is_empty());
    }

    #[test]
    fn an_older_settings_file_loads_with_the_defaults_and_keeps_new_fields() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(&path, r#"{"theme":"light"}"#).unwrap();
        let loaded = Settings::load_from(&path);
        assert_eq!(loaded.cloud_sync, CloudSyncSettings::default());
        // A partial block keeps its own fields and defaults the rest.
        std::fs::write(
            &path,
            r#"{"cloudSync":{"consentVersion":1,"includeEnv":true}}"#,
        )
        .unwrap();
        let loaded = Settings::load_from(&path);
        assert!(loaded.cloud_sync.include_env && loaded.cloud_sync.enabled);
        assert_eq!(loaded.cloud_sync.consent_version, 1);
        loaded.save_to(&path).unwrap();
        assert_eq!(Settings::load_from(&path).cloud_sync, loaded.cloud_sync);
    }

    #[test]
    fn sharing_the_codex_login_is_off_by_default_and_a_general_consent_never_turns_it_on() {
        let agreed = CloudSyncSettings {
            consent_version: CLOUD_SYNC_CONSENT_VERSION,
            ..Default::default()
        };
        assert!(agreed.active() && !agreed.share_codex_login);
        // An older file (with or without a cloudSync block) loads with it off; a stored true survives a round trip.
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("settings.json");
        std::fs::write(
            &path,
            r#"{"cloudSync":{"consentVersion":1,"enabled":true}}"#,
        )
        .unwrap();
        assert!(!Settings::load_from(&path).cloud_sync.share_codex_login);
        std::fs::write(&path, r#"{"cloudSync":{"shareCodexLogin":true}}"#).unwrap();
        let loaded = Settings::load_from(&path);
        assert!(loaded.cloud_sync.share_codex_login);
        loaded.save_to(&path).unwrap();
        assert!(Settings::load_from(&path).cloud_sync.share_codex_login);
        // Nothing in the file but the flag: the login itself is never stored here.
        assert!(!std::fs::read_to_string(&path).unwrap().contains("token"));
    }
}
