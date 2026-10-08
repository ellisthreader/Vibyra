//! Public, non-secret acknowledgements and validated restrictive snapshots.
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestrictionReceipt {
    pub account_scope: String,
    pub user_id: String,
    pub generation: u64,
    pub revision: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct DeviceRevision {
    pub public_key: String,
    pub revision: u64,
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestrictionPage {
    pub host_id: String,
    pub user_id: String,
    pub generation: u64,
    pub revision: u64,
    pub disable_revision: u64,
    pub reset_revision: u64,
    pub revoked_devices: Vec<DeviceRevision>,
    pub approved_devices: Vec<DeviceRevision>,
    pub next_revision: u64,
    pub has_more: bool,
}
/// Pages are accumulated only for one immutable server revision. A changed
/// snapshot is retried from the last durable acknowledgement, never skipped.
pub struct RestrictionBatch {
    pub(crate) receipt: RestrictionReceipt,
    pub(crate) page: Option<RestrictionPage>,
    pub(crate) removed: Vec<DeviceRevision>,
    cursor: u64,
}
impl RestrictionBatch {
    pub fn new(receipt: RestrictionReceipt) -> Self {
        Self {
            cursor: receipt.revision,
            receipt,
            page: None,
            removed: Vec::new(),
        }
    }
    pub fn resets_trust(&self) -> bool {
        self.page
            .as_ref()
            .is_some_and(|page| page.reset_revision > self.receipt.revision)
    }
    pub fn revoked_keys(&self) -> Vec<&str> {
        self.removed
            .iter()
            .filter(|device| {
                !self.page.as_ref().is_some_and(|page| {
                    page.approved_devices.iter().any(|approved| {
                        approved.public_key == device.public_key
                            && approved.revision > device.revision
                    })
                })
            })
            .map(|device| device.public_key.as_str())
            .collect()
    }
    pub fn cursor(&self) -> u64 {
        self.cursor
    }
    pub fn revision(&self) -> Option<u64> {
        self.page.as_ref().map(|page| page.revision)
    }
    pub fn complete(&self) -> bool {
        self.page.as_ref().is_some_and(|page| !page.has_more)
    }
    pub fn accept(&mut self, host: &str, mut page: RestrictionPage) -> Result<bool, String> {
        let invalid = || "Remote security state changed; retrying safely".to_owned();
        if page.host_id != host
            || page.user_id != self.receipt.user_id
            || page.generation != self.receipt.generation
            || page.revision < self.receipt.revision
            || page.revision > 9_007_199_254_740_991
            || page.disable_revision > page.revision
            || page.reset_revision > page.revision
            || page.next_revision > page.revision
            || page.approved_devices.len() > 64
            || page.revoked_devices.len() > 100
            || self.complete()
            || self.removed.len() + page.revoked_devices.len() > 10_000
        {
            return Err(invalid());
        }
        page.approved_devices
            .sort_by(|a, b| a.public_key.cmp(&b.public_key));
        if let Some(previous) = &self.page {
            if previous.revision != page.revision
                || previous.reset_revision != page.reset_revision
                || previous.disable_revision != page.disable_revision
                || previous.approved_devices != page.approved_devices
            {
                return Err(invalid());
            }
        }
        let valid_key = |key: &str| {
            key.len() == 64
                && key
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        };
        let mut last = self.cursor;
        for device in &page.revoked_devices {
            if !valid_key(&device.public_key)
                || device.revision <= last
                || device.revision > page.revision
            {
                return Err(invalid());
            }
            last = device.revision;
        }
        let mut approved = std::collections::HashSet::new();
        for device in &page.approved_devices {
            if !valid_key(&device.public_key)
                || device.revision > page.revision
                || !approved.insert(&device.public_key)
            {
                return Err(invalid());
            }
        }
        if (page.has_more && (page.revoked_devices.is_empty() || page.next_revision != last))
            || (!page.has_more && page.next_revision != page.revision)
        {
            return Err(invalid());
        }
        self.cursor = page.next_revision;
        self.removed.extend(page.revoked_devices.clone());
        let disabled = page.disable_revision > self.receipt.revision;
        self.page = Some(page);
        Ok(disabled)
    }
}
