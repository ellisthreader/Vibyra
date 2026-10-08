//! A fake engine and fake settings for the worker tests.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;
use vibyra_sync::{
    AccountState, CloudChange, LoginOutcome, LoginStatus, ProjectRef, RemoteConsent, SyncError,
    SyncOptions, SyncOutcome,
};

use super::port::{AutoApply, Config, Env, Event, Port};

#[derive(Default)]
pub(super) struct Fake {
    pub(super) calls: Mutex<Vec<String>>,
    pub(super) sync_results: Mutex<VecDeque<Result<SyncOutcome, SyncError>>>,
    pub(super) polls: Mutex<VecDeque<Result<Vec<CloudChange>, SyncError>>>,
    pub(super) cloud_enabled: Mutex<bool>,
    /// The phone consent version `account()` reports.
    pub(super) remote_consent: Mutex<Option<u32>>,
    /// `account()` fails as offline.
    pub(super) account_offline: Mutex<bool>,
    pub(super) auto: Mutex<Option<AutoApply>>,
    pub(super) known: Mutex<Vec<ProjectRef>>,
    pub(super) depth: AtomicUsize,
    pub(super) max_depth: AtomicUsize,
    pub(super) login_results: Mutex<VecDeque<Result<LoginOutcome, SyncError>>>,
    /// What the engine would remember: set by a send, cleared by a removal.
    pub(super) login_sent_at: Mutex<Option<u64>>,
    /// The `access` `account()` reports (`None` = an older server).
    pub(super) access: Mutex<Option<vibyra_sync::CloudAccess>>,
}

#[derive(Clone)]
pub(super) struct FakePort(pub(super) Arc<Fake>);

impl FakePort {
    fn log(&self, line: String) {
        self.0.calls.lock().push(line);
    }
    fn enter(&self) {
        let d = self.0.depth.fetch_add(1, Ordering::SeqCst) + 1;
        self.0.max_depth.fetch_max(d, Ordering::SeqCst);
    }
    fn leave(&self) {
        self.0.depth.fetch_sub(1, Ordering::SeqCst);
    }
}

impl Port for FakePort {
    fn account(&self) -> vibyra_sync::Result<AccountState> {
        self.log("account".into());
        if *self.0.account_offline.lock() {
            return Err(SyncError::Network("offline".into()));
        }
        Ok(AccountState {
            enabled: *self.0.cloud_enabled.lock(),
            vm_key: Some("k".into()),
            consent: self.0.remote_consent.lock().map(|version| RemoteConsent {
                version,
                accepted_at: None,
            }),
            access: self.0.access.lock().clone(),
            ..Default::default()
        })
    }
    fn register(&self, _: &str) -> vibyra_sync::Result<()> {
        self.log("register".into());
        Ok(())
    }
    fn sync(&self, p: &ProjectRef, o: &SyncOptions) -> vibyra_sync::Result<SyncOutcome> {
        self.enter();
        self.log(format!(
            "sync {} env={} conv={}",
            p.id, o.include_env, o.include_transcripts
        ));
        let r = self
            .0
            .sync_results
            .lock()
            .pop_front()
            .unwrap_or(Ok(SyncOutcome::Unchanged {
                held_back: vec![],
                transcripts_seq: None,
            }));
        self.leave();
        r
    }
    fn poll_down(&self) -> vibyra_sync::Result<Vec<CloudChange>> {
        self.log("poll".into());
        self.0.polls.lock().pop_front().unwrap_or(Ok(vec![]))
    }
    fn remove(&self, p: &ProjectRef) -> vibyra_sync::Result<()> {
        self.log(format!("remove {}", p.id));
        Ok(())
    }
    fn known(&self) -> Vec<ProjectRef> {
        self.0.known.lock().clone()
    }
    fn remember(&self, p: &ProjectRef) {
        let mut known = self.0.known.lock();
        if !known.iter().any(|k| k.id == p.id) {
            known.push(p.clone());
        }
    }
    fn forget(&self, p: &ProjectRef) {
        self.0.known.lock().retain(|k| k.id != p.id);
    }
    fn auto_apply(&self, _: &ProjectRef) -> vibyra_sync::Result<AutoApply> {
        Ok(self.0.auto.lock().clone().unwrap_or(AutoApply::NeedsReview))
    }
    fn session(&self) -> Option<String> {
        Some("session".into())
    }
    fn codex_login_send(&self, force: bool) -> vibyra_sync::Result<LoginOutcome> {
        self.log(format!("login send force={force}"));
        let result = self
            .0
            .login_results
            .lock()
            .pop_front()
            .unwrap_or(Ok(LoginOutcome::Unchanged));
        if matches!(result, Ok(LoginOutcome::Sent { .. })) {
            *self.0.login_sent_at.lock() = Some(1_700_000_000);
        }
        result
    }
    fn codex_login_remove(&self) -> vibyra_sync::Result<()> {
        self.log("login remove".into());
        *self.0.login_sent_at.lock() = None;
        Ok(())
    }
    fn codex_login_status(&self) -> LoginStatus {
        let sent_at = *self.0.login_sent_at.lock();
        LoginStatus {
            sent: sent_at.is_some(),
            sent_at,
            seq: 0,
        }
    }
}

#[derive(Clone)]
pub(super) struct FakeEnv {
    pub(super) cfg: Arc<Mutex<Config>>,
    pub(super) events: Arc<Mutex<Vec<Event>>>,
}
impl Env for FakeEnv {
    fn config(&self) -> Config {
        self.cfg.lock().clone()
    }
    fn emit(&self, event: Event) {
        self.events.lock().push(event);
    }
}
