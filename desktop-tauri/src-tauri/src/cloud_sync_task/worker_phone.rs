//! The account's "Connect to cloud" agreement, made on the iPhone or on any Mac, is this Mac's sync consent
//! too: an account that agreed (`GET /` `consent.version` current) syncs here with no Mac switch and no Mac
//! dialog. Nothing is written to settings; only "Pause syncing on this Mac" keeps it out (the gate checks it first).

use vibyra_core::cloud_sync_settings::CLOUD_SYNC_CONSENT_VERSION;
use vibyra_sync::{AccountState, SyncError};

use super::board::Gate;
use super::port::{Config, Env, Event, Port};
use super::worker::{Worker, ACCOUNT_MS};

pub(super) fn phone_consented(account: &AccountState) -> bool {
    account
        .consent
        .as_ref()
        .is_some_and(|c| c.version >= CLOUD_SYNC_CONSENT_VERSION)
}

impl<P: Port, E: Env> Worker<P, E> {
    /// `None` when consent does not hold the gate; `Starting` while the phone consent is still unknown
    /// (so the Mac dialog does not flash before the first answer).
    pub(super) fn consent_gate(&self, cfg: &Config) -> Option<Gate> {
        if cfg.sync.consented() || self.phone == Some(true) {
            None
        } else if self.phone.is_none() {
            Some(Gate::Starting)
        } else {
            Some(Gate::NeedsConsent)
        }
    }

    pub(super) fn note_account(&mut self, cfg: &Config, account: &AccountState, now: u64) {
        self.cloud = Some((account.enabled, now));
        self.phone = Some(phone_consented(account));
        self.phone_at = Some(now);
        self.note_access(account, now);
        self.publish_consent(cfg);
    }

    /// Signed in, not paused, never agreed on this Mac: ask the account whether it agreed (on the iPhone or
    /// another Mac), at most every `ACCOUNT_MS`. Once it has, the regular account read keeps it fresh.
    pub(super) fn check_phone(&mut self, cfg: &Config, now: u64) {
        let wanted = cfg.signed_in
            && self.session.is_some()
            && !cfg.sync.paused
            && !cfg.sync.consented()
            && self.phone != Some(true);
        if wanted
            && self
                .phone_at
                .is_none_or(|at| now.saturating_sub(at) >= ACCOUNT_MS)
        {
            match self.port.account() {
                Ok(account) => self.note_account(cfg, &account, now),
                Err(error) => {
                    self.phone_at = Some(now);
                    // Offline stays "checking"; a definite answer (refused, not eligible) opens the dialog path.
                    if !matches!(error, SyncError::Network(_)) && self.phone.is_none() {
                        self.phone = Some(false);
                    }
                }
            }
        }
        self.publish_consent(cfg);
    }

    /// What the status shows about the agreement, refreshed with every account read (a withdrawal on the iPhone
    /// shows at once, not a step later).
    fn publish_consent(&self, cfg: &Config) {
        let from_phone = !cfg.sync.consented() && self.phone == Some(true);
        let checked = cfg.sync.consented() || self.phone.is_some();
        let mut board = self.board.lock();
        if board.consent_from_phone != from_phone
            || board.consent_checked != checked
            || board.account_consent != self.phone
        {
            board.consent_from_phone = from_phone;
            board.consent_checked = checked;
            board.account_consent = self.phone;
            drop(board);
            self.env.emit(Event::Status);
        }
    }
}
