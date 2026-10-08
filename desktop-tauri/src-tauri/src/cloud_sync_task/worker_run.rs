//! The actions the worker performs when the scheduler says one is due: upload one
//! project, ask the cloud for its changes, and record failures.

use vibyra_sync::{project_key, CloudChange, ProjectRef, SyncError, SyncOptions, SyncOutcome};

use super::board::unix_now;
use super::port::{AutoApply, ChangeNotice, Config, Env, Event, Port};
use super::schedule::Failure;
use super::worker::{failure_kind, Worker};
use super::worker_access::not_allowed;

/// While the cloud computer has never booted there is nothing to seal to; look again in a minute.
const WAITING_RETRY_MS: u64 = 60_000;

fn friendly(error: &SyncError, kind: Failure) -> String {
    match kind {
        Failure::Network => "Vibyra could not reach the cloud. It will try again shortly.".into(),
        Failure::Auth => match error {
            SyncError::Api { .. } => {
                "Your plan does not include keeping projects in the cloud.".into()
            }
            _ => "Sign in again to keep your projects ready in the cloud.".into(),
        },
        Failure::Project => error.to_string(),
    }
}

impl<P: Port, E: Env> Worker<P, E> {
    pub(super) fn fail_global(&mut self, error: &SyncError, now: u64) -> Option<u64> {
        let kind = failure_kind(error);
        self.sched.fail(kind, now);
        self.board.lock().message = Some(friendly(error, kind));
        self.env.emit(Event::Status);
        Some(self.idle_after_failure(now))
    }

    /// How long to idle when nothing can run right now (paused or failing).
    pub(super) fn idle_after_failure(&mut self, now: u64) -> u64 {
        match self.sched.next(now) {
            super::schedule::Action::Idle(wait) => wait,
            _ => 1_000,
        }
    }

    pub(super) fn run_sync(&mut self, cfg: &Config, project: &ProjectRef) {
        let options = SyncOptions {
            include_env: cfg.sync.include_env,
            include_transcripts: cfg.sync.include_conversations,
            ..SyncOptions::default()
        };
        self.board
            .lock()
            .projects
            .entry(project.id.clone())
            .or_default()
            .running = true;
        self.env.emit(Event::Status);
        self.sched.begin_sync(&project.id);
        let result = self.port.sync(project, &options);
        let now = (self.clock)();
        let mut board = self.board.lock();
        let live = board.projects.entry(project.id.clone()).or_default();
        live.running = false;
        match result {
            Ok(outcome) => {
                let waiting = matches!(outcome, SyncOutcome::WaitingForCloud);
                live.waiting = waiting;
                live.error = None;
                live.retry_at = None;
                board.message = None;
                drop(board);
                self.sched.end_sync(&project.id, Ok(()), now);
                if waiting {
                    self.sched.defer(&project.id, now + WAITING_RETRY_MS);
                } else {
                    self.port.remember(project);
                }
            }
            Err(error) if not_allowed(&error) => {
                // Not ticked for Vibyra Cloud: no error, no retries until the next account read lists it.
                (live.waiting, live.error) = (false, None);
                drop(board);
                self.sched.end_sync(&project.id, Ok(()), now);
                self.refused_project(cfg, &project.id, now);
            }
            Err(error) => {
                let kind = failure_kind(&error);
                live.waiting = false;
                live.error = Some(friendly(&error, kind));
                drop(board);
                self.sched.end_sync(&project.id, Err(kind), now);
                let retry = self
                    .sched
                    .retry_at(&project.id)
                    .map(|t| unix_now() + t.saturating_sub(now) / 1000);
                let mut board = self.board.lock();
                if let Some(live) = board.projects.get_mut(&project.id) {
                    live.retry_at = retry;
                }
                if kind != Failure::Project {
                    board.message = Some(friendly(&error, kind));
                }
            }
        }
        self.env.emit(Event::Status);
    }

    pub(super) fn run_poll(&mut self, cfg: &Config) {
        self.sched.begin_poll();
        let result = self.port.poll_down();
        let now = (self.clock)();
        match result {
            Ok(changes) => {
                self.sched.end_poll(Ok(()), now);
                {
                    let mut board = self.board.lock();
                    board.last_poll_at = Some(unix_now());
                    board.message = None;
                }
                self.announce(cfg, changes);
            }
            Err(error) => {
                let kind = failure_kind(&error);
                self.sched.end_poll(Err(kind), now);
                if kind != Failure::Project {
                    self.board.lock().message = Some(friendly(&error, kind));
                    self.env.emit(Event::Status);
                }
            }
        }
    }

    /// Each new cloud change is applied quietly when the user allowed it and it is clean, else announced once.
    fn announce(&mut self, cfg: &Config, changes: Vec<CloudChange>) {
        let mut notices = Vec::new();
        for change in changes {
            let Some(project) = cfg
                .projects
                .iter()
                .find(|p| project_key(&p.id) == change.project_key)
            else {
                continue;
            };
            if cfg.sync.auto_apply_safe && cfg.sync.project_enabled(&project.id) {
                if let Ok(AutoApply::Applied(_)) = self.port.auto_apply(project) {
                    continue;
                }
            }
            if self
                .notified
                .insert((change.project_key.clone(), change.seq))
            {
                notices.push(ChangeNotice {
                    project_id: project.id.clone(),
                    project_name: project.name.clone(),
                    project_key: change.project_key.clone(),
                    seq: change.seq,
                    files: change.files.len(),
                });
            }
        }
        if !notices.is_empty() {
            self.env.emit(Event::Changes(notices));
        }
        self.env.emit(Event::Status);
    }
}
