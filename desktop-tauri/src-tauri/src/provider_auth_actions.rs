//! The three things a user does to one account: sign it in, install the CLI it
//! needs, and sign it out.
//!
//! Each runs the provider's own CLI with that account's folder named in the
//! environment, which is what keeps a second ChatGPT login from overwriting
//! the first.

use std::process::Command;

use super::{unknown_provider, ProviderAuthManager};
use crate::provider_auth_files::{disconnect_gemini, prepare_gemini_oauth};
use crate::provider_auth_install::install_command;
use crate::provider_auth_probe::key;
use crate::provider_auth_process::{command_status, select_account};
use crate::provider_auth_state::{definition, installed, ProviderView};

impl ProviderAuthManager {
    pub fn connect(
        &self,
        provider_id: &str,
        account_id: &str,
    ) -> Result<Vec<ProviderView>, String> {
        let provider = definition(provider_id).ok_or_else(unknown_provider)?;
        if !installed(provider) {
            return Err(format!("Install {} before connecting.", provider.product));
        }
        let home = self.home(provider_id, account_id)?;
        home.ensure()?;
        let id = key(provider_id, account_id);
        self.attempts.cancel(&id);
        if provider_id == "gemini" {
            // Gemini has no `login` verb: it picks OAuth from its settings
            // file, which has to exist in this account's folder first.
            prepare_gemini_oauth(&home.credentials_dir())?;
        }
        let mut command = Command::new(provider.program);
        match provider_id {
            "codex" => {
                command.arg("login");
            }
            "claude" => {
                command.args(["auth", "login", "--claudeai"]);
            }
            "gemini" => {}
            _ => return Err(unknown_provider()),
        }
        select_account(&mut command, home.env());
        self.spawn(
            &id,
            false,
            command,
            format!("Could not start {} authorization", provider.company),
        )
    }

    /// Installs the provider's CLI, which is the step that used to be a
    /// sentence telling the user to go and do it themselves.
    ///
    /// Not account-scoped: one CLI serves every account, so this is filed
    /// under the first one and the whole card reports its progress.
    pub fn install(&self, provider_id: &str) -> Result<Vec<ProviderView>, String> {
        let provider = definition(provider_id).ok_or_else(unknown_provider)?;
        let command = install_command(provider)?;
        let id = key(provider_id, crate::provider_auth_home::DEFAULT_ACCOUNT);
        self.attempts.cancel(&id);
        self.spawn(
            &id,
            true,
            command,
            format!("Could not install {}", provider.product),
        )
    }

    pub fn disconnect(
        &self,
        provider_id: &str,
        account_id: &str,
    ) -> Result<Vec<ProviderView>, String> {
        let provider = definition(provider_id).ok_or_else(unknown_provider)?;
        let home = self.home(provider_id, account_id)?;
        let id = key(provider_id, account_id);
        self.attempts.cancel(&id);
        let logout = if provider_id == "gemini" {
            disconnect_gemini(&home.credentials_dir()).map(|_| true)
        } else if installed(provider) {
            let args = if provider_id == "codex" {
                vec!["logout"]
            } else {
                vec!["auth", "logout"]
            };
            command_status(provider.program, &args, home.env())
        } else {
            Ok(false)
        };
        let views = self.view(Some(&id));
        if signed_out(&views, provider_id, account_id) {
            return Ok(views);
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

/// Whether the account really is signed out now, read back from a fresh probe
/// rather than assumed from the logout command's exit code.
fn signed_out(views: &[ProviderView], provider_id: &str, account_id: &str) -> bool {
    views
        .iter()
        .find(|view| view.id == provider_id)
        .and_then(|view| {
            view.accounts
                .iter()
                .find(|account| account.account_id == account_id)
        })
        .is_some_and(|account| {
            matches!(
                account.status.as_str(),
                "sign-in-required" | "not-installed"
            )
        })
}
