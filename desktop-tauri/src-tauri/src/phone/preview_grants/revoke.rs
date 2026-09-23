use super::{identity::absolute_root, store, PreviewGrants};
use std::path::Path;
use std::sync::atomic::Ordering;

impl PreviewGrants {
    /// Revocation takes effect in memory immediately. Storage failures disable
    /// all Preview grants for this process and attempt to clear the file.
    pub fn revoke(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
    ) -> Result<(), String> {
        let source_root = absolute_root(root)?;
        let mut current = self.grants.lock();
        current.retain(|item| {
            !(item.device_id == device_id
                && item.project_id == project_id
                && item.source_root == source_root
                && item.target_id == target_id)
        });
        self.persist_revocation(&mut current, &mut self.automatic.lock())
    }

    pub fn revoke_device(&self, device_id: &str) -> Result<(), String> {
        let mut current = self.grants.lock();
        let mut automatic = self.automatic.lock();
        current.retain(|item| item.device_id != device_id);
        automatic.retain(|item| item.device_id != device_id);
        self.persist_revocation(&mut current, &mut automatic)
    }

    /// Account sign-out or account move removes every Preview grant.
    pub fn revoke_all(&self) -> Result<(), String> {
        *self.account.lock() = None;
        let mut current = self.grants.lock();
        current.clear();
        self.automatic.lock().clear();
        if let Err(error) = store::clear(&self.state_dir) {
            self.disabled.store(true, Ordering::SeqCst);
            return Err(error);
        }
        Ok(())
    }

    fn persist_revocation(
        &self,
        current: &mut Vec<super::Grant>,
        automatic: &mut Vec<super::AutomaticDevice>,
    ) -> Result<(), String> {
        if let Err(error) = store::save(&self.state_dir, current, automatic) {
            self.disabled.store(true, Ordering::SeqCst);
            current.clear();
            automatic.clear();
            let _ = store::clear(&self.state_dir);
            return Err(format!("Preview sharing disabled: {error}"));
        }
        Ok(())
    }
}
