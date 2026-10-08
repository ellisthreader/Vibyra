//! Legacy status compatibility: local login copying is permanently off. Cloud's
//! independent sign-ins are shown through cloud_logins and the account API.
use super::board::{BoardData, Gate};
use serde::Serialize;
use vibyra_core::cloud_sync_settings::CloudSyncSettings;

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CodexLoginView {
    pub on: bool,
    pub state: &'static str,
    pub sent_at: Option<u64>,
    pub error: Option<String>,
}
pub fn codex_login_view(
    _sync: &CloudSyncSettings,
    _gate: Gate,
    _board: &BoardData,
) -> CodexLoginView {
    CodexLoginView {
        on: false,
        state: "off",
        sent_at: None,
        error: None,
    }
}
