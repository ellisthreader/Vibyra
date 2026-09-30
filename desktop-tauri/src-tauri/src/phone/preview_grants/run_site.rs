//! Exact managed website grants created by approved phone runs.
use super::PreviewGrants;
use std::path::Path;

impl PreviewGrants {
    pub(crate) fn grant_run_site(
        &self,
        device: &str,
        project: &str,
        root: &Path,
        target: &str,
        run_id: &str,
        account: &str,
    ) -> Result<String, String> {
        // Only a detected managed website, never an arbitrary port or native window.
        let inspection =
            vibyra_core::preview::inspect_project(root.to_str().ok_or("Invalid folder")?)
                .map_err(|e| e.to_string())?;
        if !inspection.targets.iter().any(|item| {
            item.id == target
                && item.runnable
                && item.kind != vibyra_core::preview::PreviewTargetKind::Desktop
        }) {
            return Err("The run does not name a managed website".into());
        }
        let (_, fingerprint, _) = super::current::current_identity(root, target)?;
        self.grant_checked(
            device,
            project,
            root,
            target,
            "/",
            Some((account, &fingerprint)),
            Some(run_id),
        )?;
        self.grants
            .lock()
            .iter()
            .find(|grant| {
                grant.device_id == device
                    && grant.project_id == project
                    && grant.target_id == target
                    && grant.run.as_deref() == Some(run_id)
            })
            .map(|grant| grant.id.clone())
            .ok_or_else(|| "Website approval was revoked".into())
    }
}
