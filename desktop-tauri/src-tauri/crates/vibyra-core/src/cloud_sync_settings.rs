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
#[serde(rename_all = "camelCase", from = "StoredCloudSync")]
pub struct CloudSyncSettings {
    /// Kept for older readers: always `!paused`. Nothing here reads it any more.
    pub enabled: bool,
    /// "Pause syncing on this Mac": the one way to keep this Mac out of Vibyra Cloud while the account is
    /// connected. Off by default, so agreeing on either device (the iPhone or this Mac) is enough to sync.
    pub paused: bool,
    /// The consent text the user last agreed to on this Mac; 0 means never asked here.
    pub consent_version: u32,
    /// Also send this project's Claude and Codex conversations.
    pub include_conversations: bool,
    /// Also send `.env` files (private keys and tokens are never sent).
    pub include_env: bool,
    /// Write cloud changes into the project without a review when no file the
    /// cloud touched has changed on this Mac since the last upload.
    pub auto_apply_safe: bool,
    /// Projects the user switched off, by project id. Only an older server without the access contract
    /// uses this as the selection; with it, the account's ticks decide.
    pub disabled_project_ids: Vec<String>,
    /// "Use my Codex login in the cloud": the separate opt-in that carries `~/.codex/auth.json` to the cloud
    /// computer. Off by default and never switched on by the general consent; only the explicit command that
    /// follows its own consent dialog sets it.
    pub share_codex_login: bool,
}

/// The block as stored. `paused` is new: a file without it is read from the switch it replaces, so someone
/// who agreed on this Mac and then switched syncing off stays off, and everyone else follows the account.
#[derive(Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct StoredCloudSync {
    enabled: bool,
    paused: Option<bool>,
    consent_version: u32,
    include_conversations: bool,
    include_env: bool,
    auto_apply_safe: bool,
    disabled_project_ids: Vec<String>,
    share_codex_login: bool,
}

impl Default for StoredCloudSync {
    fn default() -> Self {
        let d = CloudSyncSettings::default();
        Self {
            enabled: d.enabled,
            paused: None,
            consent_version: d.consent_version,
            include_conversations: d.include_conversations,
            include_env: d.include_env,
            auto_apply_safe: d.auto_apply_safe,
            disabled_project_ids: d.disabled_project_ids,
            share_codex_login: d.share_codex_login,
        }
    }
}

impl From<StoredCloudSync> for CloudSyncSettings {
    fn from(s: StoredCloudSync) -> Self {
        let paused = s.paused.unwrap_or(!s.enabled && s.consent_version > 0);
        Self {
            enabled: !paused,
            paused,
            consent_version: s.consent_version,
            include_conversations: s.include_conversations,
            include_env: s.include_env,
            auto_apply_safe: s.auto_apply_safe,
            disabled_project_ids: s.disabled_project_ids,
            share_codex_login: s.share_codex_login,
        }
    }
}

impl Default for CloudSyncSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            paused: false,
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
    /// True once the user agreed to the current text on this Mac.
    pub fn consented(&self) -> bool {
        self.consent_version >= CLOUD_SYNC_CONSENT_VERSION
    }

    /// "Pause syncing on this Mac" on or off; `enabled` follows for older readers.
    pub fn set_paused(&mut self, paused: bool) {
        self.paused = paused;
        self.enabled = !paused;
    }

    /// Whether this Mac may upload on its own agreement alone (not paused, agreed here). The account's
    /// agreement on the iPhone is the other way in; the worker checks that one.
    pub fn active(&self) -> bool {
        !self.paused && self.consented()
    }

    /// Whether this Mac would need an agreement before syncing: not paused and never agreed here. The
    /// account may still have agreed on the iPhone, which the worker asks the server about.
    pub fn needs_consent(&self) -> bool {
        !self.paused && !self.consented()
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
#[path = "cloud_sync_settings_tests.rs"]
mod tests;
