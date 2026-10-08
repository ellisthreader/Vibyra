//! An existing-Cloud receipt, minted only under live phone admission.
//! Public identity bindings survive app restart; bearer tokens never reach disk.
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::PathBuf;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Receipt {
    pub account: String,
    pub host: String,
    pub device: String,
    pub approved_at: String,
    pub generation: String,
}
pub(crate) fn account_binding(key: &str) -> String {
    Sha256::digest(format!("vibyra-cloud-management-v1\0{key}"))
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}
pub(crate) struct Grants {
    path: PathBuf,
    receipt: Mutex<Option<Receipt>>,
    disabled: std::sync::atomic::AtomicBool,
}
impl Grants {
    pub fn load(path: PathBuf) -> Self {
        let loaded = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice(&bytes).map_err(|_| ()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(()),
        };
        let disabled = loaded.is_err();
        Self {
            path,
            receipt: Mutex::new(loaded.unwrap_or(None)),
            disabled: std::sync::atomic::AtomicBool::new(disabled),
        }
    }
    pub fn current(&self) -> Option<Receipt> {
        if self.disabled.load(std::sync::atomic::Ordering::SeqCst) {
            return None;
        }
        self.receipt.lock().clone()
    }
    pub fn mint(&self, mut receipt: Receipt) -> Result<(), String> {
        if self.disabled.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("Cloud management approval storage is unavailable.".into());
        }
        let mut current = self.receipt.lock();
        if let Some(previous) = current.as_ref().filter(|old| {
            old.account == receipt.account
                && old.host == receipt.host
                && old.device == receipt.device
                && old.approved_at == receipt.approved_at
        }) {
            receipt.generation.clone_from(&previous.generation);
        }
        store::write(&self.path, Some(&receipt))?;
        *current = Some(receipt);
        Ok(())
    }
    pub fn revoke(&self) -> Result<(), String> {
        self.clear(&mut self.receipt.lock())
    }
    /// A delayed read/action cannot clear a newer approval, even in the same account.
    pub fn revoke_matching(&self, expected: Option<&Receipt>) -> Result<bool, String> {
        let mut current = self.receipt.lock();
        if current.as_ref() != expected {
            return Ok(false);
        }
        self.clear(&mut current)?;
        Ok(true)
    }
    fn clear(&self, current: &mut Option<Receipt>) -> Result<(), String> {
        *current = None;
        if let Err(error) = store::write(&self.path, None) {
            self.disabled
                .store(true, std::sync::atomic::Ordering::SeqCst);
            return Err(error);
        }
        Ok(())
    }
}
pub(crate) mod policy;
mod store;
#[cfg(test)]
mod tests;
