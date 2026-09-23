//! Mac-owned grants for remote website Preview.
use current::current_identity;
use identity::absolute_root;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

const MAX_GRANTS: usize = 128;

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct Grant {
    id: String,
    #[serde(default)]
    account_id: String,
    device_id: String,
    project_id: String,
    source_root: PathBuf,
    canonical_root: PathBuf,
    target_id: String,
    target_fingerprint: String,
    #[serde(default = "attached::root_path")]
    start_path: String,
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(super) struct AutomaticDevice {
    account_id: String,
    device_id: String,
}

#[derive(Clone)]
pub(crate) struct ApprovedPreview {
    /// The exact path the Mac renderer approved, used for PreviewManager's key.
    pub source_root: PathBuf,
    /// The canonical root checked on every authorization.
    pub root: PathBuf,
    pub target_id: String,
    pub attached_port: Option<u16>,
    pub start_path: String,
}

#[derive(Clone)]
pub(crate) struct GrantScope {
    pub id: String,
    pub project_id: String,
    pub source_root: PathBuf,
    pub target_id: String,
}

pub(crate) struct PreviewGrants {
    state_dir: PathBuf,
    account: Mutex<Option<String>>,
    grants: Mutex<Vec<Grant>>,
    automatic: Mutex<Vec<AutomaticDevice>>,
    disabled: AtomicBool,
}

impl PreviewGrants {
    /// Corrupt or unreadable state fails closed.
    pub fn load(state_dir: PathBuf) -> Result<Self, String> {
        let (grants, automatic) = store::load(&state_dir)?;
        Ok(Self {
            state_dir,
            account: Mutex::new(None),
            grants: Mutex::new(grants),
            automatic: Mutex::new(automatic),
            disabled: AtomicBool::new(false),
        })
    }

    /// Rechecks the original path, canonical destination, and target metadata.
    /// The returned root is local-only and is never a browser URL.
    pub fn authorize(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
    ) -> Result<ApprovedPreview, String> {
        if self.disabled.load(Ordering::SeqCst) {
            return Err("Preview sharing is disabled after a storage error".into());
        }
        let account_id = self
            .account
            .lock()
            .clone()
            .ok_or("Sign in to share Preview")?;
        let source_root = absolute_root(root)?;
        let grant = self
            .grants
            .lock()
            .iter()
            .find(|item| {
                item.device_id == device_id
                    && item.account_id == account_id
                    && item.project_id == project_id
                    && item.source_root == source_root
                    && item.target_id == target_id
            })
            .cloned()
            .ok_or("Preview is not approved for this phone and project")?;
        let (canonical_root, fingerprint, attached_port) =
            current_identity(&source_root, target_id)?;
        let start_path = attached::start_path(&grant.start_path)?;
        if canonical_root != grant.canonical_root || fingerprint != grant.target_fingerprint {
            return Err("Preview changed on the Mac; approve it again".into());
        }
        let active = self.account.lock();
        if self.disabled.load(Ordering::SeqCst)
            || active.as_deref() != Some(account_id.as_str())
            || !self.grants.lock().contains(&grant)
        {
            return Err("Preview approval was revoked".into());
        }
        Ok(ApprovedPreview {
            source_root,
            root: canonical_root,
            target_id: grant.target_id,
            attached_port,
            start_path,
        })
    }
}

mod account;
pub(crate) mod attached;
mod automatic;
mod current;
mod fingerprint;
mod grant_create;
mod identity;
mod inventory;
mod lookup;
mod revoke;
mod store;
