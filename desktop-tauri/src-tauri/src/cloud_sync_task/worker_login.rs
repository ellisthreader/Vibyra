//! Legacy copied-login cleanup only. Sending local credentials is permanently disabled.
use vibyra_sync::client::LOGIN_BLOCKED;
use vibyra_sync::{LoginOutcome, SyncError};

use super::login_track::LOGIN_POLL_MS;
use super::port::{Config, Env, Event, Port};
use super::schedule::Failure;
use super::schedule_types::backoff;
use super::worker::{failure_kind, Worker};

impl<P: Port, E: Env> Worker<P, E> {
    /// Runs on every step, before the gate: tracks the switch and, when it is off, takes a login this Mac sent
    /// out of the cloud (a signed-out Mac cannot; it is tried again after the next sign-in).
    pub(super) fn login_housekeeping(&mut self, cfg: &Config, now: u64) {
        if !self.login.seeded {
            self.login.seeded = true;
            self.board.lock().login.sent_at = self.port.codex_login_status().sent_at;
        }
        let on = false; // Local credential copying is permanently retired.
        self.login.switch(on, now);
        if on || self.login.clean || now < self.login.retry_remove_at {
            return;
        }
        if !cfg.signed_in || self.port.session().is_none() {
            return;
        }
        if !self.port.codex_login_status().sent {
            self.login.clean = true;
            return;
        }
        match self.port.codex_login_remove() {
            Ok(()) => {
                self.login.clean = true;
                self.login.failures = 0;
                self.board.lock().login = Default::default();
            }
            Err(error) => {
                self.login.failures += 1;
                self.login.retry_remove_at = now + backoff(self.login.failures);
                self.board.lock().login.error = Some(error.to_string());
            }
        }
        self.env.emit(Event::Status);
    }

    pub(super) fn login_due(&self, _cfg: &Config, now: u64) -> bool {
        self.login.is_due(false, now)
    }

    /// How long a worker that is otherwise idle for `wait` ms may sleep before the login poll is due.
    pub(super) fn login_wait(&self, _cfg: &Config, _now: u64, wait: u64) -> u64 {
        wait
    }

    pub(super) fn run_login(&mut self) {
        self.board.lock().login.running = true;
        self.env.emit(Event::Status);
        let result = self.port.codex_login_send(self.login.force);
        let now = (self.clock)();
        let sent_at = self.port.codex_login_status().sent_at;
        let mut board = self.board.lock();
        board.login.running = false;
        board.login.sent_at = sent_at;
        let (mut not_signed_in, mut waiting, mut error) = (false, false, None);
        match &result {
            Ok(LoginOutcome::Sent { .. }) | Ok(LoginOutcome::Unchanged) => {
                self.login.after_ok(now, true)
            }
            Ok(LoginOutcome::Throttled { retry_in_secs }) => self
                .login
                .after_wait(now, retry_in_secs.saturating_mul(1000)),
            Ok(LoginOutcome::NotSignedIn) => {
                not_signed_in = true;
                self.login.after_ok(now, false);
            }
            Ok(LoginOutcome::WaitingForCloud) => {
                waiting = true;
                self.login.after_wait(now, LOGIN_POLL_MS);
            }
            Err(e) if e.code() == Some(LOGIN_BLOCKED) => {
                // Turned off from the iPhone: no error and no retries until an account read allows it again.
                self.codex_blocked = true;
                board.codex_blocked = true;
                self.login.after_ok(now, true);
            }
            Err(e) => {
                error = Some(login_message(e));
                self.login.after_failure(now);
            }
        }
        board.login.not_signed_in = not_signed_in;
        board.login.waiting = waiting;
        board.login.error = error;
        drop(board);
        if let Err(e) = result {
            if failure_kind(&e) != Failure::Project && e.code() != Some(LOGIN_BLOCKED) {
                self.fail_global(&e, now);
            }
        }
        self.env.emit(Event::Status);
    }
}

/// A short line for the window. The engine's messages never carry the file's contents.
fn login_message(error: &SyncError) -> String {
    match failure_kind(error) {
        Failure::Network => "Vibyra could not reach the cloud. It will try again shortly.".into(),
        Failure::Auth => "Sign in again to use your Codex login in the cloud.".into(),
        Failure::Project => error.to_string(),
    }
}
