//! Re-resolve the exact approved target after detection and immediately before launch.
use super::{run_control::RunTarget, PreviewService};
use crate::phone::preview_grants::{runs::RunApprovalState, ApprovedPreview};
use std::sync::Arc;
use vibyra_core::{
    preview::{with_launch_authorization, PreviewStatus},
    CoreError,
};

impl PreviewService {
    pub(super) fn start_approved(
        &self,
        device: &str,
        id: &str,
        approved: &ApprovedPreview,
    ) -> Result<PreviewStatus, String> {
        let service = self.clone();
        let (device, id, expected) = (device.to_owned(), id.to_owned(), approved.clone());
        with_launch_authorization(
            Arc::new(move |_| {
                super::control_access::check().map_err(CoreError::Preview)?;
                let current = service
                    .inner
                    .grants
                    .authorize_id(&device, &id, &service.inner.workspace.read())
                    .map_err(CoreError::Preview)?;
                if current.root != expected.root
                    || current.source_root != expected.source_root
                    || current.target_id != expected.target_id
                {
                    return Err(CoreError::Preview("This Preview target changed".into()));
                }
                super::control_access::check().map_err(CoreError::Preview)
            }),
            || {
                self.inner
                    .manager
                    .start_with(
                        approved
                            .source_root
                            .to_str()
                            .ok_or("Invalid Preview folder")?,
                        &approved.target_id,
                        &self
                            .inner
                            .grants
                            .custom_commands(&approved.project_id, &approved.source_root),
                    )
                    .map_err(|error| error.to_string())
            },
        )
    }
    pub(super) fn start_run_checked(&self, run: &RunTarget) -> Result<PreviewStatus, CoreError> {
        let service = self.clone();
        let run = run.clone();
        let target = run.clone();
        let account = self
            .inner
            .grants
            .active_account()
            .map_err(CoreError::Preview)?;
        with_launch_authorization(
            Arc::new(move |_| {
                super::control_access::check().map_err(CoreError::Preview)?;
                let current = service
                    .resolve_run(
                        &target.project_id,
                        Some(&target.source_root),
                        Some(&target.target.id),
                        target.command.as_ref(),
                    )
                    .map_err(CoreError::Preview)?;
                if service
                    .inner
                    .grants
                    .active_account()
                    .map_err(CoreError::Preview)?
                    != account
                    || current.canonical_root != target.canonical_root
                    || current.fingerprint != target.fingerprint
                    || service.run_approval(&current).map_err(CoreError::Preview)?
                        != RunApprovalState::Approved
                {
                    return Err(CoreError::Preview(
                        "This approved app changed. Review it again.".into(),
                    ));
                }
                super::control_access::check().map_err(CoreError::Preview)
            }),
            || {
                self.inner.manager.start_with(
                    run.source_root
                        .to_str()
                        .ok_or_else(|| CoreError::Preview("Invalid project folder".into()))?,
                    &run.target.id,
                    &run.custom,
                )
            },
        )
    }
}
