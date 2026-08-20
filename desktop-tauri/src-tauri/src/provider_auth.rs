use std::io::Write;
use std::process::{Command, Stdio};
use std::sync::Arc;

use parking_lot::Mutex;

use crate::provider_auth_attempt::{AttemptState, LoginAttemptStore};
use crate::provider_auth_files::{disconnect_gemini, prepare_gemini_oauth};
use crate::provider_auth_process::{command_status, strip_credentials};
use crate::provider_auth_state::{definition, installed, probe_all, ProviderAccountView};
use crate::provider_auth_url::{capture, open};

#[derive(Default)]
pub struct ProviderAuthManager {
    attempts: LoginAttemptStore,
}

impl ProviderAuthManager {
    pub fn accounts(&self) -> Vec<ProviderAccountView> {
        probe_all()
            .into_iter()
            .map(|(provider, available, auth)| {
                if auth.connected {
                    self.attempts.finish_connected(provider.id);
                }
                let attempt = self.attempts.view(provider.id);
                let status = if auth.connected {
                    "connected"
                } else if !available {
                    "not-installed"
                } else if attempt.state == AttemptState::Failed {
                    "error"
                } else if attempt.state == AttemptState::Connecting {
                    "connecting"
                } else if auth.probe_failed {
                    "error"
                } else {
                    "sign-in-required"
                };
                let detail = match status {
                    "connected" => auth.detail.clone(),
                    "not-installed" => {
                        format!("Install {} to connect this account.", provider.product)
                    }
                    "connecting" => "Finish authorization in the provider browser window.".into(),
                    "error" if attempt.state == AttemptState::Failed => {
                        "Authorization ended before the account connected. Try again.".into()
                    }
                    "error" => {
                        "Could not verify this account. Check the provider app and try again."
                            .into()
                    }
                    _ => format!("Connect your existing {} account.", provider.product),
                };
                ProviderAccountView {
                    id: provider.id.into(),
                    company: provider.company.into(),
                    product: provider.product.into(),
                    runtime_id: provider.runtime_id.into(),
                    installed: available,
                    status: status.into(),
                    account_label: auth.account_label,
                    detail,
                    sign_in_page_available: attempt.sign_in_page_available,
                }
            })
            .collect()
    }

    pub fn connect(&self, id: &str) -> Result<Vec<ProviderAccountView>, String> {
        let provider = definition(id).ok_or_else(|| "Unknown AI account provider.".to_string())?;
        if !installed(provider) {
            return Err(format!("Install {} before connecting.", provider.product));
        }
        self.attempts.cancel(id);
        if id == "gemini" {
            prepare_gemini_oauth()?;
        }
        let mut command = Command::new(provider.program);
        match id {
            "codex" => {
                command.arg("login");
            }
            "claude" => {
                command.args(["auth", "login", "--claudeai"]);
            }
            "gemini" => {}
            _ => return Err("Unknown AI account provider.".into()),
        }
        command.current_dir(dirs::home_dir().unwrap_or_else(std::env::temp_dir));
        command.stdin(if id == "gemini" {
            Stdio::piped()
        } else {
            Stdio::null()
        });
        command.stdout(Stdio::piped()).stderr(Stdio::piped());
        strip_credentials(&mut command);
        let mut child = command.spawn().map_err(|error| {
            format!(
                "Could not start {} authorization: {error}",
                provider.company
            )
        })?;
        if id == "gemini" {
            if let Some(mut stdin) = child.stdin.take() {
                let _ = stdin.write_all(b"y\n");
            }
        }
        let sign_in_url = Arc::new(Mutex::new(String::new()));
        if let Some(stdout) = child.stdout.take() {
            capture(stdout, Arc::clone(&sign_in_url));
        }
        if let Some(stderr) = child.stderr.take() {
            capture(stderr, Arc::clone(&sign_in_url));
        }
        self.attempts.insert(id, child, sign_in_url);
        Ok(self.accounts())
    }

    pub fn open_sign_in_page(&self, id: &str) -> Result<(), String> {
        definition(id).ok_or_else(|| "Unknown AI account provider.".to_string())?;
        let url = self
            .attempts
            .sign_in_url(id)
            .ok_or_else(|| "Start account authorization first.".to_string())?;
        open(&url)
    }

    pub fn cancel(&self, id: &str) -> Result<Vec<ProviderAccountView>, String> {
        definition(id).ok_or_else(|| "Unknown AI account provider.".to_string())?;
        self.attempts.cancel(id);
        Ok(self.accounts())
    }

    pub fn disconnect(&self, id: &str) -> Result<Vec<ProviderAccountView>, String> {
        let provider = definition(id).ok_or_else(|| "Unknown AI account provider.".to_string())?;
        self.attempts.cancel(id);
        let logout = if id == "gemini" {
            disconnect_gemini().map(|_| true)
        } else if installed(provider) {
            let args = if id == "codex" {
                vec!["logout"]
            } else {
                vec!["auth", "logout"]
            };
            command_status(provider.program, &args)
        } else {
            Ok(false)
        };
        let accounts = self.accounts();
        let disconnected = accounts
            .iter()
            .find(|account| account.id == id)
            .is_some_and(|account| {
                matches!(
                    account.status.as_str(),
                    "sign-in-required" | "not-installed"
                )
            });
        if disconnected {
            return Ok(accounts);
        }
        let message = match logout {
            Ok(true) => format!("{} still reports a connected account.", provider.company),
            Ok(false) => format!("{} logout did not complete.", provider.company),
            Err(error) => error,
        };
        Err(format!(
            "Could not disconnect {}. {message}",
            provider.company
        ))
    }
}
