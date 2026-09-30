//! Fast live window consent checks: native input callbacks must never recurse
//! into platform inventory or filesystem inspection while an OS lock is held.
use super::{Grant, PreviewGrants};
use crate::phone::workspace::DesktopWorkspace;
use std::path::PathBuf;
use std::sync::atomic::Ordering;

pub(crate) struct WindowConsent {
    grant: Grant,
    project_root: PathBuf,
}

impl PreviewGrants {
    pub(crate) fn window_consent(
        &self,
        device: &str,
        id: &str,
        workspace: &DesktopWorkspace,
    ) -> Result<WindowConsent, String> {
        let account = self.account.lock();
        let grant = self
            .grants
            .lock()
            .iter()
            .find(|grant| {
                grant.id == id
                    && grant.device_id == device
                    && account.as_deref() == Some(grant.account_id.as_str())
            })
            .cloned()
            .ok_or("Window Preview approval is unavailable")?;
        if !crate::window_preview::Target::parse(&grant.target_id)?
            .is_some_and(|target| target.control)
        {
            return Err("Window Preview is shared for viewing only.".into());
        }
        let project_root = workspace
            .project_root(&grant.project_id)
            .ok_or("Window Preview project is no longer open")?;
        Ok(WindowConsent {
            grant,
            project_root,
        })
    }

    pub(crate) fn require_window_consent(
        &self,
        consent: &WindowConsent,
        workspace: &DesktopWorkspace,
    ) -> Result<(), String> {
        let account = self
            .account
            .try_lock()
            .ok_or("Window approval is being updated")?;
        let grants = self
            .grants
            .try_lock()
            .ok_or("Window approval is being updated")?;
        if self.disabled.load(Ordering::SeqCst)
            || account.as_deref() != Some(consent.grant.account_id.as_str())
            || !grants.contains(&consent.grant)
            || workspace.project_root(&consent.grant.project_id).as_ref()
                != Some(&consent.project_root)
        {
            return Err("Window Preview approval ended. Reopen Preview.".into());
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "window_consent_tests.rs"]
mod tests;
