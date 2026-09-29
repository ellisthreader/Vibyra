use super::{
    attached,
    current::current_identity,
    identity::{absolute_root, same_slot, validate_id},
    store, Grant, PreviewGrants, MAX_GRANTS,
};
use std::path::Path;
use std::sync::atomic::Ordering;

impl PreviewGrants {
    /// Called only after the Mac owner approves this exact detected target.
    pub fn grant(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
    ) -> Result<(), String> {
        self.grant_at(device_id, project_id, root, target_id, "/")
    }

    pub fn grant_at(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
        start_path: &str,
    ) -> Result<(), String> {
        self.grant_checked(
            device_id, project_id, root, target_id, start_path, None, None,
        )
    }

    /// A phone can approve only the exact view-only candidate it was shown.
    pub(crate) fn grant_window(
        &self,
        device: &str,
        project: &str,
        root: &Path,
        target: &str,
        account: &str,
        fingerprint: &str,
    ) -> Result<(), String> {
        // The owner chose this window on the phone to see and use it; input
        // still needs the computer's permissions and every per-tap check.
        if crate::window_preview::Target::parse(target)?.is_none() {
            return Err("Phone window approval covers application windows only".into());
        }
        self.grant_checked(
            device,
            project,
            root,
            target,
            "/",
            Some((account, fingerprint)),
            None,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub(super) fn grant_checked(
        &self,
        device_id: &str,
        project_id: &str,
        root: &Path,
        target_id: &str,
        start_path: &str,
        expected: Option<(&str, &str)>,
        run: Option<&str>,
    ) -> Result<(), String> {
        if self.disabled.load(Ordering::SeqCst) {
            return Err("Preview sharing is disabled after a storage error".into());
        }
        let account_id = self
            .account
            .lock()
            .clone()
            .ok_or("Sign in to share Preview")?;
        validate_id(device_id)?;
        validate_id(project_id)?;
        let source_root = absolute_root(root)?;
        let (canonical_root, target_fingerprint, attached_port) =
            current_identity(&source_root, target_id)?;
        if expected.is_some_and(|(account, fingerprint)| {
            account != account_id || fingerprint != target_fingerprint
        }) {
            return Err("The window or account changed. Refresh Preview before sharing.".into());
        }
        let start_path = if let Some(port) = attached_port {
            attached::origin(port)?;
            attached::start_path(start_path)?
        } else if start_path == "/" {
            "/".into()
        } else {
            return Err("Managed Preview has no custom opening path".into());
        };
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let id = bytes.iter().map(|byte| format!("{byte:02x}")).collect();
        let grant = Grant {
            id,
            account_id: account_id.clone(),
            device_id: device_id.into(),
            project_id: project_id.into(),
            source_root,
            canonical_root,
            target_id: target_id.into(),
            target_fingerprint,
            start_path,
            run: run.map(str::to_owned),
        };
        let active = self.account.lock();
        if active.as_deref() != Some(account_id.as_str()) {
            return Err("Preview account changed".into());
        }
        let mut current = self.grants.lock();
        let mut next = current.clone();
        next.retain(|item| !same_slot(item, &grant));
        next.push(grant);
        if next.len() > MAX_GRANTS {
            return Err("Too many Preview grants".into());
        }
        store::save(&self.state_dir, &next, &self.automatic.lock())?;
        *current = next;
        Ok(())
    }
}
