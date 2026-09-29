//! Local restrictive actions must finish before any Cloud request is awaited.
use super::PhoneConnection;
impl PhoneConnection {
    pub fn owns_remote_host(&self, host: &str) -> Result<bool, String> {
        let id = match &self.host {
            Some(host) => Some(host.id()),
            None => vibyra_host::saved_identity_id(&self.path)?,
        };
        Ok(id.as_deref() == Some(host))
    }
    pub fn revoke_remote_devices(&self, device: Option<&str>) -> Result<(), String> {
        match (&self.host, device) {
            (Some(host), None) => host.revoke_all_devices(),
            (Some(host), Some(device)) => {
                if host.status()["devices"]
                    .as_array()
                    .is_some_and(|items| items.iter().any(|item| item["id"] == device))
                {
                    host.revoke(device)
                } else {
                    Ok(())
                }
            }
            (None, device) => vibyra_host::revoke_saved_devices(&self.path, device),
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn removing_all_preview_devices_preserves_the_account_and_requires_new_approval() {
        let dir = tempfile::tempdir().unwrap();
        let grants =
            crate::phone::preview_grants::PreviewGrants::load(dir.path().to_owned()).unwrap();
        grants.set_account(Some("user:owner")).unwrap();
        grants.set_automatic("phone", true).unwrap();
        assert!(grants.automatic("phone"));
        grants.revoke_all_devices().unwrap();
        assert!(!grants.automatic("phone"));
        grants.set_automatic("phone", true).unwrap();
        assert!(grants.automatic("phone"));
    }
}
