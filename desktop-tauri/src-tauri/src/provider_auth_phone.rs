//! The additional entry points a paired phone needs. They use the same local
//! account registry and CLI manager as the Mac settings window.
use super::{unknown_provider, ProviderAuthManager};
use crate::provider_auth_probe::key;
use crate::provider_auth_registry::Registry;
use crate::provider_auth_state::{definition, installed, ProviderView};

impl ProviderAuthManager {
    /// Creates an account and starts authorization immediately; no empty
    /// account row is left behind simply because Add was pressed.
    pub fn add_account(&self, provider_id: &str) -> Result<Vec<ProviderView>, String> {
        self.add_account_with_mode(provider_id, false)
    }

    pub fn add_account_from_phone(&self, provider_id: &str) -> Result<Vec<ProviderView>, String> {
        self.add_account_with_mode(provider_id, true)
    }

    fn add_account_with_mode(
        &self,
        provider_id: &str,
        phone: bool,
    ) -> Result<Vec<ProviderView>, String> {
        let provider = definition(provider_id).ok_or_else(unknown_provider)?;
        if !installed(provider) {
            return Err(format!("Install {} before connecting.", provider.product));
        }
        let mut registry = Registry::load();
        let account_id = registry.add(provider_id)?;
        if phone {
            self.connect_from_phone(provider_id, &account_id)
        } else {
            self.connect(provider_id, &account_id)
        }
    }

    /// Codex device authorization has a browser page the phone can open.
    /// Other CLI browser callbacks stay on the Mac that owns their credentials.
    pub fn phone_sign_in_url(&self, provider_id: &str, account_id: &str) -> Result<String, String> {
        if provider_id != "codex" {
            return Err("Finish this provider sign-in on your Mac.".into());
        }
        self.home(provider_id, account_id)?;
        self.attempts
            .sign_in_url(&key(provider_id, account_id))
            .filter(|url| url.starts_with("https://"))
            .ok_or_else(|| "Waiting for Codex to provide its device sign-in page.".into())
    }
}
