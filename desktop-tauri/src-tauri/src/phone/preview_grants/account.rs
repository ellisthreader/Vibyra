use super::{identity::validate_id, store, PreviewGrants};
use std::sync::atomic::Ordering;

impl PreviewGrants {
    /// Only a verified account identity may use Preview grants. On an account
    /// change, grants from the previous account are removed before access is
    /// enabled. A failed write disables Preview, without affecting sign-in.
    pub fn set_account(&self, account_id: Option<&str>) -> Result<(), String> {
        let mut active = self.account.lock();
        *active = None;
        if let Some(id) = account_id {
            validate_id(id)?;
        }
        if self.disabled.load(Ordering::SeqCst) {
            return Err("Preview sharing is disabled after a storage error".into());
        }
        let mut current = self.grants.lock();
        let mut automatic = self.automatic.lock();
        if let Some(id) = account_id {
            if current.iter().any(|grant| grant.account_id != id)
                || automatic.iter().any(|device| device.account_id != id)
            {
                let next = current
                    .iter()
                    .filter(|grant| grant.account_id == id)
                    .cloned()
                    .collect::<Vec<_>>();
                let next_auto = automatic
                    .iter()
                    .filter(|device| device.account_id == id)
                    .cloned()
                    .collect::<Vec<_>>();
                if let Err(error) = store::save(&self.state_dir, &next, &next_auto) {
                    self.disabled.store(true, Ordering::SeqCst);
                    current.clear();
                    automatic.clear();
                    return Err(format!("Preview sharing disabled: {error}"));
                }
                *current = next;
                *automatic = next_auto;
            }
            *active = Some(id.to_owned());
        }
        Ok(())
    }
}
