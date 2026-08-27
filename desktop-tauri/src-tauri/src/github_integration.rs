use std::ffi::OsString;
use std::sync::Arc;
use std::time::{Duration, Instant};

use parking_lot::Mutex;
use serde::Serialize;

use crate::github_auth_flow::{AuthChild, CodeCopier};
use crate::github_integration_probe::{default_program, probe, run};

const SETTLE_WINDOW: Duration = Duration::from_secs(3);
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubIntegrationStatus {
    pub gh_installed: bool,
    pub connected: bool,
    pub connecting: bool,
    pub login: Option<String>,
    pub permissions_ready: bool,
    pub error: Option<String>,
}
struct Attempt {
    child: AuthChild,
    finished: Option<(bool, Instant)>,
}
pub struct GithubIntegrationManager {
    program: OsString,
    copier: CodeCopier,
    attempt: Mutex<Option<Attempt>>,
    error: Mutex<Option<String>>,
}
impl Default for GithubIntegrationManager {
    fn default() -> Self {
        Self::new(
            default_program(),
            Arc::new(crate::commands::clipboard::copy_text),
        )
    }
}
impl GithubIntegrationManager {
    fn new(program: OsString, copier: CodeCopier) -> Self {
        Self {
            program,
            copier,
            attempt: Mutex::new(None),
            error: Mutex::new(None),
        }
    }
    pub fn status(&self) -> GithubIntegrationStatus {
        let mut status = probe(&self.program);
        self.reconcile_attempt(&mut status);
        status.error = self.error.lock().clone();
        status
    }

    pub fn connect(&self) -> GithubIntegrationStatus {
        self.cancel_child();
        *self.error.lock() = None;
        let mut status = probe(&self.program);
        if !status.gh_installed {
            status.error = Some("Install GitHub CLI before connecting.".into());
            return status;
        }
        if status.permissions_ready {
            return status;
        }
        let args = if status.connected {
            vec![
                "auth",
                "refresh",
                "--hostname",
                "github.com",
                "--scopes",
                "repo,workflow,read:org,gist",
            ]
        } else {
            vec![
                "auth",
                "login",
                "--hostname",
                "github.com",
                "--git-protocol",
                "https",
                "--web",
                "--scopes",
                "repo,workflow,read:org,gist",
            ]
        };
        match self.spawn(&args) {
            Ok(()) => status.connecting = true,
            Err(error) => status.error = Some(error),
        }
        status
    }

    pub fn cancel(&self) -> GithubIntegrationStatus {
        self.cancel_child();
        *self.error.lock() = None;
        probe(&self.program)
    }

    pub fn disconnect(&self) -> GithubIntegrationStatus {
        self.cancel_child();
        *self.error.lock() = None;
        let before = probe(&self.program);
        let Some(login) = before.login else {
            return before;
        };
        let result = run(
            &self.program,
            &[
                "auth",
                "logout",
                "--hostname",
                "github.com",
                "--user",
                &login,
            ],
        );
        let mut after = probe(&self.program);
        if result.is_err() || after.connected {
            after.error =
                Some("GitHub could not be disconnected. Your account is still connected.".into());
        }
        after
    }

    fn spawn(&self, args: &[&str]) -> Result<(), String> {
        let child = crate::github_auth_flow::spawn(&self.program, args, Arc::clone(&self.copier))?;
        *self.attempt.lock() = Some(Attempt {
            child,
            finished: None,
        });
        Ok(())
    }

    fn reconcile_attempt(&self, status: &mut GithubIntegrationStatus) {
        let mut slot = self.attempt.lock();
        let Some(attempt) = slot.as_mut() else { return };
        if status.permissions_ready {
            *slot = None;
            *self.error.lock() = None;
            return;
        }
        if attempt.finished.is_none() {
            match attempt.child.child.try_wait() {
                Ok(Some(exit)) => attempt.finished = Some((exit.success(), Instant::now())),
                Ok(None) => {
                    status.connecting = true;
                    return;
                }
                Err(_) => attempt.finished = Some((false, Instant::now())),
            }
        }
        let (success, finished) = attempt.finished.expect("finished attempt");
        if success && finished.elapsed() < SETTLE_WINDOW {
            status.connecting = true;
            return;
        }
        let copy_failed = attempt.child.copy_failed();
        *slot = None;
        let message = if copy_failed {
            "GitHub authorization failed and its one-time code could not be copied. Check clipboard access, then retry."
        } else if success {
            "GitHub authorization finished, but the account or required permissions were not verified."
        } else {
            "GitHub authorization did not complete."
        };
        *self.error.lock() = Some(message.into());
    }

    fn cancel_child(&self) {
        if let Some(mut attempt) = self.attempt.lock().take() {
            crate::provider_auth_process::stop_child(&mut attempt.child.child);
        }
    }

    // Gated exactly as their only callers are: the tests below drive a fake
    // `gh` that is a `/bin/sh` script, so they cannot run on Windows. Left on
    // a bare `cfg(test)` these would compile there with nothing calling them,
    // and `-D warnings` turns that into a failed release build.
    #[cfg(all(test, unix))]
    fn test(program: &std::ffi::OsStr) -> Self {
        Self::test_with_copier(program, Arc::new(|_| Ok(())))
    }

    #[cfg(all(test, unix))]
    fn test_with_copier(program: &std::ffi::OsStr, copier: CodeCopier) -> Self {
        Self::new(program.to_os_string(), copier)
    }
}

impl Drop for GithubIntegrationManager {
    fn drop(&mut self) {
        if let Some(mut attempt) = self.attempt.get_mut().take() {
            crate::provider_auth_process::stop_child(&mut attempt.child.child);
        }
    }
}

#[cfg(all(test, unix))]
#[path = "github_integration_tests.rs"]
mod tests;
