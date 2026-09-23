use super::{identity::validate_id, store, AutomaticDevice, PreviewGrants, MAX_GRANTS};
use std::sync::atomic::Ordering;

impl PreviewGrants {
    /// A separate, opt-in permission for project-local running websites. It is
    /// never inferred from an old pairing or from a per-port grant.
    pub fn set_automatic(&self, device_id: &str, enabled: bool) -> Result<(), String> {
        validate_id(device_id)?;
        if self.disabled.load(Ordering::SeqCst) {
            return Err("Preview sharing is disabled after a storage error".into());
        }
        let account = self.account.lock();
        let account_id = account
            .as_ref()
            .ok_or("Sign in to allow automatic Preview")?;
        let grants = self.grants.lock();
        let mut current = self.automatic.lock();
        let mut next = current.clone();
        next.retain(|item| item.device_id != device_id);
        if enabled {
            next.push(AutomaticDevice {
                account_id: account_id.clone(),
                device_id: device_id.into(),
            });
        }
        if next.len() > MAX_GRANTS {
            return Err("Too many Preview phones".into());
        }
        if let Err(error) = store::save(&self.state_dir, &grants, &next) {
            self.disabled.store(true, Ordering::SeqCst);
            current.clear();
            return Err(format!("Preview sharing disabled: {error}"));
        }
        *current = next;
        Ok(())
    }

    pub fn automatic(&self, device_id: &str) -> bool {
        if self.disabled.load(Ordering::SeqCst) {
            return false;
        }
        let account = self.account.lock();
        self.automatic.lock().iter().any(|item| {
            item.device_id == device_id && account.as_deref() == Some(item.account_id.as_str())
        })
    }
}
