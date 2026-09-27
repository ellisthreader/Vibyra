use super::{identity, ApprovedPreview, PreviewGrants};
use crate::phone::workspace::DesktopWorkspace;

impl PreviewGrants {
    /// Opaque phone scope ID. The current desktop inventory must still own the
    /// project and exact worktree before this ID may start or open Preview.
    pub fn authorize_id(
        &self,
        device_id: &str,
        grant_id: &str,
        workspace: &DesktopWorkspace,
    ) -> Result<ApprovedPreview, String> {
        let active = self.account.lock();
        let grant = self
            .grants
            .lock()
            .iter()
            .find(|grant| {
                grant.id == grant_id
                    && grant.device_id == device_id
                    && active.as_deref() == Some(grant.account_id.as_str())
            })
            .cloned()
            .ok_or("Preview approval is unavailable")?;
        drop(active);
        let project = workspace
            .project_root(&grant.project_id)
            .ok_or("This project is no longer open on the Mac")?;
        identity::current_scope(&project, &grant.source_root)?;
        self.authorize(
            device_id,
            &grant.project_id,
            &grant.source_root,
            &grant.target_id,
        )
    }
}
