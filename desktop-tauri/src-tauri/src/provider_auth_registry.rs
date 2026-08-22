//! Which accounts exist, per provider.
//!
//! This file holds **no credentials**. Those stay in each account's own
//! directory, written and rotated by the provider's CLI — Vibyra never reads
//! or copies a token. All that is recorded here is that an account exists, so
//! its folder can be found again after a restart.
//!
//! The default account is deliberately absent from the file: every provider
//! always has one, it is whatever the CLI uses on its own, and writing it down
//! would only create a second source of truth for something that cannot vary.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::provider_auth_home::{accounts_root, AccountHome, DEFAULT_ACCOUNT};

const VERSION: u32 = 1;

/// Ceiling on accounts per provider. Each one costs a CLI probe on every
/// refresh, so this is what stops a runaway list from making the pane crawl.
pub const MAX_PER_PROVIDER: usize = 8;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredAccount {
    pub provider: String,
    pub id: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Registry {
    version: u32,
    #[serde(default)]
    accounts: Vec<StoredAccount>,
    /// Where the account folders live. Not serialised: it is the location of
    /// the file itself, which cannot sensibly be stored inside it.
    #[serde(skip)]
    root: Option<PathBuf>,
}

impl Default for Registry {
    fn default() -> Self {
        Self {
            version: VERSION,
            accounts: Vec::new(),
            root: None,
        }
    }
}

impl Registry {
    /// A missing or unreadable file means "no extra accounts", never an error:
    /// the default account still works, so the pane must still open.
    pub fn load() -> Self {
        let Ok(root) = accounts_root() else {
            return Self::default();
        };
        Self::load_from(&root)
    }

    pub fn load_from(root: &Path) -> Self {
        let mut registry = std::fs::read_to_string(root.join("accounts.json"))
            .ok()
            .and_then(|raw| serde_json::from_str::<Self>(&raw).ok())
            .filter(|registry| registry.version == VERSION)
            .unwrap_or_default();
        registry.root = Some(root.to_path_buf());
        registry
    }

    /// Every account id for one provider, default first. The default is
    /// synthesised rather than stored, so it can never go missing.
    pub fn ids(&self, provider: &str) -> Vec<String> {
        std::iter::once(DEFAULT_ACCOUNT.to_string())
            .chain(
                self.accounts
                    .iter()
                    .filter(|account| account.provider == provider)
                    .map(|account| account.id.clone()),
            )
            .collect()
    }

    /// The home for one account, rooted in this registry's tree.
    pub fn home(&self, provider: &str, id: &str) -> Result<AccountHome, String> {
        if id == DEFAULT_ACCOUNT {
            return Ok(AccountHome::rooted(provider, id, None));
        }
        if !self.holds(provider, id) {
            return Err("Unknown account.".into());
        }
        let root = self.root.clone().ok_or_else(|| {
            "No configuration folder is available to keep extra accounts in.".to_string()
        })?;
        Ok(AccountHome::rooted(
            provider,
            id,
            Some(root.join(provider).join(id)),
        ))
    }

    fn holds(&self, provider: &str, id: &str) -> bool {
        self.accounts
            .iter()
            .any(|account| account.provider == provider && account.id == id)
    }

    /// Records a new account and creates its folder.
    ///
    /// The folder is made here rather than at sign-in time so a failure the
    /// user can act on — a full disk, a read-only config directory — is
    /// reported by the button they just pressed instead of by a CLI later.
    pub fn add(&mut self, provider: &str) -> Result<String, String> {
        if self.ids(provider).len() >= MAX_PER_PROVIDER {
            return Err(format!(
                "You can hold {MAX_PER_PROVIDER} accounts per provider."
            ));
        }
        let root = self.root.clone().ok_or_else(|| {
            "No configuration folder is available to keep extra accounts in.".to_string()
        })?;
        let id = generate_id();
        AccountHome::rooted(provider, &id, Some(root.join(provider).join(&id))).ensure()?;
        self.accounts.push(StoredAccount {
            provider: provider.to_string(),
            id: id.clone(),
        });
        self.save()?;
        Ok(id)
    }

    /// Forgets an account and deletes its folder, credentials included.
    ///
    /// The default account cannot be removed — it is the CLI's own directory,
    /// which is not Vibyra's to delete.
    pub fn remove(&mut self, provider: &str, id: &str) -> Result<(), String> {
        if id == DEFAULT_ACCOUNT {
            return Err("The first account cannot be removed, only signed out.".into());
        }
        if !self.holds(provider, id) {
            return Err("Unknown account.".into());
        }
        // Guarded rather than trusted: this is a recursive delete, so it is
        // rebuilt from the registry's own root instead of anything passed in.
        if let Some(root) = &self.root {
            let folder = root.join(provider).join(id);
            if folder.starts_with(root) && folder.ends_with(id) {
                let _ = std::fs::remove_dir_all(&folder);
            }
        }
        self.accounts
            .retain(|account| !(account.provider == provider && account.id == id));
        self.save()
    }

    fn save(&self) -> Result<(), String> {
        let root = self
            .root
            .as_ref()
            .ok_or_else(|| "No configuration folder to save the account list in.".to_string())?;
        std::fs::create_dir_all(root).map_err(|error| error.to_string())?;
        let bytes = serde_json::to_vec_pretty(self).map_err(|error| error.to_string())?;
        vibyra_core::fsx::write_private_atomic(&root.join("accounts.json"), &bytes)
            .map_err(|error| format!("Could not save the account list: {error}"))
    }
}

fn generate_id() -> String {
    let mut bytes = [0u8; 8];
    if getrandom::fill(&mut bytes).is_err() {
        let clock = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|since| since.as_nanos())
            .unwrap_or_default();
        let seed = clock ^ u128::from(std::process::id());
        bytes.copy_from_slice(&seed.to_le_bytes()[..8]);
    }
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
#[path = "provider_auth_registry_tests.rs"]
mod tests;
