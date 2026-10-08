//! The brain of background sync: gating (signed in, not paused, agreed on either device, cloud
//! available), the scheduler, and what to do with each due action. It never touches
//! the network, the disk or the UI itself; everything goes through `Port` and `Env`,
//! so it runs against fakes in tests and against the real engine in the app.

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::Sender;

use vibyra_sync::SyncError;

use super::board::{Board, Gate};
use super::login_track::LoginTrack;
use super::port::{Config, Env, Event, Port};
use super::schedule::{Action, Failure, Scheduler};
use super::worker_access::Access;
pub use super::worker_msg::Msg;

/// How long a closed gate sleeps; a settings change wakes it sooner.
pub(super) const CLOSED_WAIT_MS: u64 = 30_000;
/// How often the account (its agreement and the ticked projects) is read while it matters, so a tick or an
/// agreement on the iPhone reaches this Mac within it. Never below 10 s; failures back off as usual.
pub(super) const ACCOUNT_MS: u64 = 15_000;

pub struct Worker<P: Port, E: Env> {
    pub(super) port: P,
    pub(super) env: E,
    pub(super) board: Board,
    pub(super) sched: Scheduler,
    pub(super) clock: Box<dyn Fn() -> u64 + Send>,
    pub(super) session: Option<String>,
    pub(super) registered: bool,
    /// `(account has a cloud computer, when we asked)`.
    pub(super) cloud: Option<(bool, u64)>,
    /// Whether the account agreed on the phone (`None` = not asked yet this session), and when we asked.
    pub(super) phone: Option<bool>,
    pub(super) phone_at: Option<u64>,
    pub(super) ack: Option<Sender<()>>,
    pub(super) notified: HashSet<(String, u64)>,
    pub(super) absent_since: HashMap<String, u64>,
    pub(super) seen: HashSet<String>,
    pub(super) prune_at: u64,
    pub(super) roots: Vec<(String, String)>,
    pub(super) login: LoginTrack,
    /// The projects ticked for Vibyra Cloud, as the last account read said.
    pub(super) access: Access,
    /// Projects the server refused as not ticked since that read.
    pub(super) refused: HashSet<String>,
    /// The iPhone turned the Codex login carry-over off.
    pub(super) codex_blocked: bool,
}

/// A gate waiting on the account (its first answer, or an agreement still to come) looks again every
/// `ACCOUNT_MS`; the others sleep until a settings change or a sign-in wakes them.
fn closed_wait(gate: Gate) -> u64 {
    match gate {
        Gate::Starting | Gate::NeedsConsent => ACCOUNT_MS,
        _ => CLOSED_WAIT_MS,
    }
}

pub fn failure_kind(error: &SyncError) -> Failure {
    match error {
        SyncError::Network(_) => Failure::Network,
        SyncError::Unauthorized(_) => Failure::Auth,
        SyncError::Api { code, .. } if code == "not_eligible" => Failure::Auth,
        _ => Failure::Project,
    }
}

impl<P: Port, E: Env> Worker<P, E> {
    /// How long until the account is due to be read again.
    fn account_wait(&self, now: u64) -> u64 {
        self.cloud.map_or(1, |(_, at)| {
            ACCOUNT_MS.saturating_sub(now.saturating_sub(at)).max(1)
        })
    }

    /// The `(project id, folder)` pairs a file watcher should cover right now.
    pub fn watch_roots(&self) -> Vec<(String, String)> {
        self.roots.clone()
    }

    fn gate(&mut self, cfg: &Config) -> Gate {
        if !cfg.signed_in || self.port.session().is_none() {
            Gate::SignedOut
        } else if cfg.sync.paused {
            Gate::Off
        } else if let Some(gate) = self.consent_gate(cfg) {
            gate
        } else if matches!(self.cloud, Some((false, _))) {
            Gate::Unavailable
        } else {
            Gate::Ready
        }
    }

    pub(super) fn set_gate(&self, gate: Gate) {
        let mut board = self.board.lock();
        if board.gate != gate {
            board.gate = gate;
            drop(board);
            self.env.emit(Event::Status);
        }
    }

    fn finish_ack(&mut self) {
        if let Some(tx) = self.ack.take() {
            let _ = tx.send(());
        }
    }

    /// Runs at most one due action. `Some(ms)` = idle, look again in that long (or when a message arrives);
    /// `None` = more may be due right now, call again.
    pub fn step(&mut self) -> Option<u64> {
        let now = (self.clock)();
        let cfg = self.env.config();
        let session = self.port.session();
        if session != self.session {
            self.reset_session(session, now);
        }
        self.login_housekeeping(&cfg, now);
        self.check_phone(&cfg, now);
        let gate = self.gate(&cfg);
        if gate != Gate::Ready {
            self.set_gate(gate);
            self.sched.forget_all();
            self.roots.clear();
            self.registered = false;
            self.finish_ack();
            return Some(closed_wait(gate));
        }
        self.plan_projects(&cfg, now);
        self.prune_removed(&cfg, now);
        if self.sched.is_paused(now) {
            self.finish_ack();
            return Some(self.idle_after_failure(now));
        }
        if self
            .cloud
            .is_none_or(|(_, at)| now.saturating_sub(at) >= ACCOUNT_MS)
        {
            match self.port.account() {
                Ok(account) => self.note_account(&cfg, &account, now),
                Err(error) => return self.fail_global(&error, now),
            }
            self.plan_projects(&cfg, now);
            let gate = self.gate(&cfg);
            self.set_gate(gate);
            if gate != Gate::Ready {
                self.sched.forget_all();
                self.roots.clear();
                self.finish_ack();
                return Some(closed_wait(gate));
            }
        }
        self.set_gate(Gate::Ready);
        if !self.registered {
            match self.port.register(&cfg.mac_name) {
                Ok(()) => self.registered = true,
                Err(error) => return self.fail_global(&error, now),
            }
        }
        match self.sched.next(now) {
            Action::Sync(id) => {
                match cfg.projects.iter().find(|p| p.id == id) {
                    Some(project) => self.run_sync(&cfg, project),
                    None => self.sched.set_projects(&[], now),
                }
                None
            }
            Action::Poll => {
                self.run_poll(&cfg);
                None
            }
            Action::Idle(wait) => {
                if self.login_due(&cfg, now) {
                    self.run_login();
                    return None;
                }
                if !self.sched.has_due(now) {
                    self.finish_ack();
                }
                Some(self.login_wait(&cfg, now, wait).min(self.account_wait(now)))
            }
        }
    }
}

#[path = "worker_init.rs"]
mod init;
