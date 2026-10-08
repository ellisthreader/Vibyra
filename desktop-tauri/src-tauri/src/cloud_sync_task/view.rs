//! The status the window shows: settings and consent, per-project sync state read
//! from the engine's own on-disk records, and what the worker is doing right now.
//! Nothing here is secret: file paths, counts, times and short messages.

use serde::Serialize;
use vibyra_core::cloud_sync_settings::CLOUD_SYNC_CONSENT_VERSION;
use vibyra_core::settings::Settings;
use vibyra_sync::returned::ReturnedSession;
use vibyra_sync::state::{ProjectState, Store};
use vibyra_sync::{project_key, FileChange, HeldBack};

use super::board::{BoardData, Gate, ProjectLive};
use super::view_login::{codex_login_view, CodexLoginView};

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PendingView {
    pub seq: u64,
    pub files: Vec<FileChange>,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProjectView {
    pub id: String,
    pub project_key: String,
    pub name: String,
    /// Ticked for Vibyra Cloud: the account's tick (made on the iPhone or here) once the account was read; before
    /// that, or with an older server, this Mac's own switch.
    pub enabled: bool,
    /// off | notChosen (switched on, not ticked for Vibyra Cloud) | syncing | pending | waiting | synced | diverged | skipped | error
    pub state: &'static str,
    /// Unix seconds of the last upload.
    pub synced_at: Option<u64>,
    pub held_back_count: usize,
    pub held_back: Vec<HeldBack>,
    pub last_error: Option<String>,
    pub skipped_reason: Option<String>,
    pub retry_at: Option<u64>,
    pub pending_change: Option<PendingView>,
    /// Conversations Vibyra Cloud continued and sent back, newest first.
    pub returned: Vec<ReturnedSession>,
    /// The newest `cloudAt` the person has seen the notice for.
    pub returned_seen_at: u64,
}

#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusView {
    /// Always `!paused`; kept for older windows.
    pub enabled: bool,
    /// "Pause syncing on this Mac".
    pub paused: bool,
    /// The account agreed to Vibyra Cloud (on the iPhone or a Mac). What the account said wins once it was read;
    /// before that, an agreement made on this Mac counts.
    pub account_connected: bool,
    pub consent_version: u32,
    pub required_consent_version: u32,
    pub needs_consent: bool,
    /// Never agreed on this Mac, but the account agreed on the phone ("Turned on from your iPhone"). Stays
    /// true while the Mac switch is off, so switching it back on needs no Mac dialog.
    pub consent_from_phone: bool,
    pub include_conversations: bool,
    pub include_env: bool,
    pub auto_apply_safe: bool,
    /// starting | signedOut | off | needsConsent | unavailable | ready
    pub gate: &'static str,
    pub message: Option<String>,
    pub last_synced_at: Option<u64>,
    pub held_back_total: usize,
    pub pending_files_total: usize,
    pub codex_login: CodexLoginView,
    pub projects: Vec<ProjectView>,
}

pub fn project_state(enabled: bool, live: &ProjectLive, st: &ProjectState) -> &'static str {
    if !enabled {
        "off"
    } else if live.running {
        "syncing"
    } else if st.skipped_reason.is_some() {
        "skipped"
    } else if st.last_error.is_some() || live.error.is_some() {
        "error"
    } else if live.waiting {
        "waiting"
    } else if st.up_seq == 0 {
        "pending"
    } else if st.diverged {
        "diverged"
    } else {
        "synced"
    }
}

pub fn build(
    settings: &Settings,
    signed_in: bool,
    board: &BoardData,
    store: &Store,
) -> SyncStatusView {
    let sync = &settings.cloud_sync;
    let gate = if !signed_in {
        Gate::SignedOut
    } else if sync.paused {
        Gate::Off
    } else if !sync.consented() && !board.consent_from_phone {
        if board.consent_checked {
            Gate::NeedsConsent
        } else {
            Gate::Starting // still asking whether the phone agreed: no dialog yet
        }
    } else if board.gate == Gate::Unavailable {
        Gate::Unavailable
    } else if board.gate == Gate::Starting {
        Gate::Starting
    } else {
        Gate::Ready
    };
    let projects: Vec<ProjectView> = settings
        .projects
        .iter()
        .map(|p| {
            let st = store.load(&project_key(&p.id));
            let enabled = if board.ticked_by_account {
                !board.not_chosen.contains(&p.id)
            } else {
                sync.project_enabled(&p.id)
            };
            let live = board.projects.get(&p.id).cloned().unwrap_or_default();
            ProjectView {
                id: p.id.clone(),
                project_key: project_key(&p.id),
                name: p.name.clone(),
                enabled,
                state: if board.not_chosen.contains(&p.id) {
                    "notChosen"
                } else {
                    project_state(enabled, &live, &st)
                },
                synced_at: st.up_at,
                held_back_count: st.held_back.len(),
                held_back: st.held_back.clone(),
                last_error: live.error.clone().or(st.last_error.clone()),
                skipped_reason: st.skipped_reason.clone(),
                retry_at: live.retry_at,
                pending_change: st.cloud.last().map(|c| PendingView {
                    seq: c.seq,
                    files: c.files.clone(),
                }),
                returned: st.returned.clone(),
                returned_seen_at: st.returned_seen_at,
            }
        })
        .collect();
    let active = projects.iter().filter(|p| p.enabled);
    SyncStatusView {
        enabled: !sync.paused,
        paused: sync.paused,
        account_connected: signed_in && board.account_consent.unwrap_or(sync.consented()),
        consent_version: sync.consent_version,
        required_consent_version: CLOUD_SYNC_CONSENT_VERSION,
        needs_consent: sync.needs_consent()
            && signed_in
            && board.consent_checked
            && !board.consent_from_phone,
        consent_from_phone: !sync.consented() && signed_in && board.consent_from_phone,
        include_conversations: sync.include_conversations,
        include_env: sync.include_env,
        auto_apply_safe: sync.auto_apply_safe,
        gate: gate.as_str(),
        message: board.message.clone(),
        last_synced_at: active.clone().filter_map(|p| p.synced_at).max(),
        held_back_total: active.clone().map(|p| p.held_back_count).sum(),
        pending_files_total: projects
            .iter()
            .filter_map(|p| p.pending_change.as_ref())
            .map(|c| c.files.len())
            .sum(),
        codex_login: codex_login_view(sync, gate, board),
        projects,
    }
}

#[cfg(test)]
#[path = "view_tests.rs"]
mod tests;
