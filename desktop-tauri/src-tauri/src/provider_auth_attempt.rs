use std::collections::HashMap;
use std::process::Child;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;

use crate::provider_auth_process::stop_child;

const SUCCESS_SETTLE_WINDOW: Duration = Duration::from_secs(3);

#[derive(Clone, Copy, Default, PartialEq, Eq)]
pub enum AttemptState {
    #[default]
    None,
    Connecting,
    Failed,
}

#[derive(Default)]
pub struct AttemptView {
    pub state: AttemptState,
    pub sign_in_page_available: bool,
}

struct LoginAttempt {
    child: Child,
    failed: bool,
    finished_at: Option<Instant>,
    sign_in_url: Arc<Mutex<String>>,
}

#[derive(Default)]
pub struct LoginAttemptStore {
    attempts: Mutex<HashMap<String, LoginAttempt>>,
}

impl LoginAttemptStore {
    pub fn insert(&self, id: &str, child: Child, sign_in_url: Arc<Mutex<String>>) {
        self.cancel(id);
        self.attempts.lock().insert(
            id.into(),
            LoginAttempt {
                child,
                failed: false,
                finished_at: None,
                sign_in_url,
            },
        );
    }

    pub fn finish_connected(&self, id: &str) {
        self.cancel(id);
    }

    pub fn cancel(&self, id: &str) {
        if let Some(mut attempt) = self.attempts.lock().remove(id) {
            stop_child(&mut attempt.child);
        }
    }

    pub fn sign_in_url(&self, id: &str) -> Option<String> {
        self.attempts
            .lock()
            .get(id)
            .map(|attempt| attempt.sign_in_url.lock().clone())
    }

    pub fn view(&self, id: &str) -> AttemptView {
        let mut attempts = self.attempts.lock();
        let Some(attempt) = attempts.get_mut(id) else {
            return AttemptView::default();
        };
        match attempt.child.try_wait() {
            Ok(Some(status)) if !status.success() => attempt.failed = true,
            Ok(Some(_)) if attempt.finished_at.is_none() => {
                attempt.finished_at = Some(Instant::now())
            }
            Ok(_) => {}
            Err(_) => attempt.failed = true,
        }
        if settled_without_connection(attempt.finished_at, Instant::now()) {
            attempt.failed = true;
        }
        let sign_in_page_available = !attempt.sign_in_url.lock().is_empty();
        AttemptView {
            state: if attempt.failed {
                AttemptState::Failed
            } else {
                AttemptState::Connecting
            },
            sign_in_page_available,
        }
    }
}

impl Drop for LoginAttemptStore {
    fn drop(&mut self) {
        for (_, mut attempt) in self.attempts.get_mut().drain() {
            stop_child(&mut attempt.child);
        }
    }
}

fn settled_without_connection(finished_at: Option<Instant>, now: Instant) -> bool {
    finished_at.is_some_and(|finished| now.duration_since(finished) >= SUCCESS_SETTLE_WINDOW)
}

#[cfg(test)]
mod tests {
    use super::{settled_without_connection, SUCCESS_SETTLE_WINDOW};
    use std::time::{Duration, Instant};

    #[test]
    fn successful_login_exit_has_a_bounded_settle_window() {
        let now = Instant::now();
        assert!(!settled_without_connection(Some(now), now));
        assert!(settled_without_connection(
            Some(now),
            now + SUCCESS_SETTLE_WINDOW + Duration::from_millis(1)
        ));
    }
}
