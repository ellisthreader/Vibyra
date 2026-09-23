use super::{GrantScope, PreviewGrants, MAX_GRANTS};
use std::path::Path;
use std::sync::atomic::Ordering;

impl PreviewGrants {
    /// Suitable for a Mac sharing toggle; stale grants appear off.
    pub fn is_granted(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
    ) -> bool {
        self.authorize(device_id, project_id, root, target_id)
            .is_ok()
    }

    /// Mac-only candidate inventory. Reauthorize before advertising or use.
    pub fn list_for_device(&self, device_id: &str) -> Vec<GrantScope> {
        if self.disabled.load(Ordering::SeqCst) {
            return Vec::new();
        }
        let active = self.account.lock();
        self.grants
            .lock()
            .iter()
            .filter(|grant| {
                grant.device_id == device_id && active.as_deref() == Some(grant.account_id.as_str())
            })
            .take(MAX_GRANTS)
            .map(|grant| GrantScope {
                id: grant.id.clone(),
                project_id: grant.project_id.clone(),
                source_root: grant.source_root.clone(),
                target_id: grant.target_id.clone(),
            })
            .collect()
    }
}
