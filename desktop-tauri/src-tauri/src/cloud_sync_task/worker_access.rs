//! Only projects the person ticked are kept in Vibyra Cloud (docs/cloud-access-contract.md). `GET /`
//! `access.projectKeys` names them; a server too old to send `access` keeps the earlier behaviour (every
//! switched-on project syncs). A `project_not_allowed` refusal means "not chosen", never an error, and
//! the project waits until the next account read lists it. `access.codexCarryOver == blocked` pauses the
//! Codex login carry-over ("Turned off from your iPhone").

use std::collections::HashSet;

use vibyra_sync::client::PROJECT_NOT_ALLOWED;
use vibyra_sync::{project_key, AccountState, SyncError};

use super::port::{Config, Env, Event, Port};
use super::worker::Worker;

/// What this session knows about the ticked projects.
#[derive(Debug, Clone, PartialEq)]
pub(super) enum Access {
    /// Not read yet this session: nothing syncs until it is.
    Unknown,
    /// The server sends no `access` (older than the contract): every switched-on project syncs.
    Legacy,
    /// The `projectKey`s the person ticked.
    Keys(HashSet<String>),
}

pub(super) fn not_allowed(error: &SyncError) -> bool {
    error.code() == Some(PROJECT_NOT_ALLOWED)
}

impl<P: Port, E: Env> Worker<P, E> {
    /// Called with every account read: the ticked projects and the Codex carry-over decision.
    pub(super) fn note_access(&mut self, account: &AccountState, now: u64) {
        self.refused.clear();
        self.access = match &account.access {
            Some(access) => Access::Keys(access.project_keys.iter().cloned().collect()),
            None => Access::Legacy,
        };
        let blocked = account.access.as_ref().is_some_and(|a| a.codex_blocked());
        if self.codex_blocked && !blocked {
            self.login.explicit(now); // allowed again from the iPhone: send at once
        }
        self.codex_blocked = blocked;
        let mut board = self.board.lock();
        if board.codex_blocked != blocked {
            board.codex_blocked = blocked;
            drop(board);
            self.env.emit(Event::Status);
        }
    }

    /// Whether this project may go to Vibyra Cloud right now (ignoring the person's own switch).
    pub(super) fn chosen(&self, id: &str) -> bool {
        match &self.access {
            Access::Unknown => false,
            Access::Legacy => true,
            Access::Keys(keys) => keys.contains(&project_key(id)) && !self.refused.contains(id),
        }
    }

    /// The projects to schedule and watch: the ones ticked for Vibyra Cloud. With the access contract the
    /// account's ticks are the whole selection, whichever device made them, so a project ticked on the iPhone
    /// goes up even if this Mac once switched it off; only an older server falls back to this Mac's switch.
    pub(super) fn plan_projects(&mut self, cfg: &Config, now: u64) {
        let by_account = matches!(self.access, Access::Keys(_));
        let enabled: Vec<_> = cfg
            .projects
            .iter()
            .filter(|p| by_account || cfg.sync.project_enabled(&p.id))
            .collect();
        let chosen: Vec<_> = enabled.iter().filter(|p| self.chosen(&p.id)).collect();
        let ids: Vec<String> = chosen.iter().map(|p| p.id.clone()).collect();
        self.roots = chosen
            .iter()
            .map(|p| (p.id.clone(), p.root.to_string_lossy().into_owned()))
            .collect();
        self.sched.set_projects(&ids, now);
        if self.access == Access::Unknown {
            return; // no "Only on this Mac" flash before the first answer
        }
        let waiting: HashSet<String> = enabled
            .iter()
            .filter(|p| !self.chosen(&p.id))
            .map(|p| p.id.clone())
            .collect();
        let mut board = self.board.lock();
        if board.not_chosen != waiting || board.ticked_by_account != by_account {
            board.not_chosen = waiting;
            board.ticked_by_account = by_account;
            drop(board);
            self.env.emit(Event::Status);
        }
    }

    /// The server refused a project the person has not ticked: drop it until the next account read.
    pub(super) fn refused_project(&mut self, cfg: &Config, id: &str, now: u64) {
        self.refused.insert(id.to_string());
        if let Some(live) = self.board.lock().projects.get_mut(id) {
            live.error = None;
            live.retry_at = None;
        }
        self.plan_projects(cfg, now);
    }
}
