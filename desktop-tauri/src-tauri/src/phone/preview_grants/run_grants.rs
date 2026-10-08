//! Viewing grants made automatically for the phone that ran an app.
use super::{
    identity::{absolute_root, current_scope},
    PreviewGrants,
};
use std::path::{Path, PathBuf};

/// A run's folder: the project itself or one of its current worktrees, as the
/// absolute path Preview keys its runs by.
pub(crate) fn run_root(project: &Path, requested: &Path) -> Result<PathBuf, String> {
    current_scope(project, requested)?;
    absolute_root(requested)
}

impl PreviewGrants {
    /// For one window of the run `run_id` started, to the device that ran it:
    /// it may view and tap (input still needs the computer's own permission
    /// and passes the same checks). Returns the opaque grant ID the phone opens.
    pub(crate) fn grant_run_window(
        &self,
        device: &str,
        project: &str,
        root: &Path,
        target: &str,
        fingerprint: &str,
        run_id: &str,
    ) -> Result<String, String> {
        if crate::window_preview::Target::parse(target)?.is_none() {
            return Err("A run shares only its own windows".into());
        }
        let account = self.active_account()?;
        self.grant_checked(
            device,
            project,
            root,
            target,
            "/",
            Some((&account, fingerprint)),
            Some(run_id),
        )?;
        let source_root = absolute_root(root)?;
        self.grants
            .lock()
            .iter()
            .find(|grant| {
                grant.device_id == device
                    && grant.project_id == project
                    && grant.source_root == source_root
                    && grant.target_id == target
                    && grant.run.as_deref() == Some(run_id)
            })
            .map(|grant| grant.id.clone())
            .ok_or_else(|| "Window approval was revoked".into())
    }

    /// Ends every window grant a run created: its app stopped or exited.
    pub(crate) fn revoke_run(&self, run_id: &str) -> Result<(), String> {
        let mut current = self.grants.lock();
        let before = current.len();
        current.retain(|grant| grant.run.as_deref() != Some(run_id));
        if current.len() == before {
            return Ok(());
        }
        self.persist_revocation(&mut current, &mut self.automatic.lock())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use vibyra_core::preview::DesktopCommand;

    fn grants() -> (tempfile::TempDir, PreviewGrants) {
        let dir = tempfile::tempdir().unwrap();
        let grants = PreviewGrants::load(dir.path().join("state")).unwrap();
        grants.set_account(Some("owner")).unwrap();
        (dir, grants)
    }

    #[test]
    fn a_run_shares_only_windows_and_takes_them_when_it_ends() {
        let (dir, grants) = grants();
        let site = "attached-port:1";
        let refused = grants.grant_run_window("phone", "p", dir.path(), site, "f", "run");
        assert!(refused.unwrap_err().contains("own windows"));

        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let target = format!("attached-port:{port}");
        let fingerprint = format!("attached-loopback-v1:{port}");
        let account = Some(("owner", fingerprint.as_str()));
        grants
            .grant_checked("phone", "p", dir.path(), &target, "/", account, Some("run"))
            .unwrap();
        grants
            .grant_at("phone", "q", dir.path(), &target, "/")
            .unwrap();
        assert_eq!(grants.list_for_device("phone").len(), 2);

        grants.revoke_run("run").unwrap();
        let left = grants.list_for_device("phone");
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].project_id, "q");
        // A run's grants never survive a restart.
        grants
            .grant_checked(
                "phone",
                "p",
                dir.path(),
                &target,
                "/",
                account,
                Some("run2"),
            )
            .unwrap();
        let reloaded = PreviewGrants::load(dir.path().join("state")).unwrap();
        reloaded.set_account(Some("owner")).unwrap();
        assert_eq!(reloaded.list_for_device("phone").len(), 1);
    }

    #[test]
    fn approvals_are_per_account_and_survive_an_empty_keychain_read() {
        use crate::phone::preview_grants::runs::RunApprovalState::*;
        let (dir, grants) = grants();
        let command = DesktopCommand {
            relative_root: ".".into(),
            argv: vec!["cargo".into(), "run".into()],
            manual: None,
        };
        let state = || grants.run_state("p", dir.path(), "t", "fp").unwrap();
        assert_eq!(state(), Missing);
        grants
            .approve_run("phone", "p", dir.path(), "t", Some(command.clone()), "fp")
            .unwrap();
        assert_eq!(state(), Approved);
        assert_eq!(
            grants.run_state("p", dir.path(), "t", "new").unwrap(),
            Changed
        );
        assert_eq!(grants.custom_commands("p", dir.path()), vec![command]);

        grants.set_account(None).unwrap();
        assert!(grants.run_state("p", dir.path(), "t", "fp").is_err());
        grants.set_account(Some("owner")).unwrap();
        assert_eq!(
            state(),
            Approved,
            "no account read must not delete approvals"
        );

        grants.set_account(Some("someone-else")).unwrap();
        assert_eq!(state(), Missing);
        let reloaded = PreviewGrants::load(dir.path().join("state")).unwrap();
        reloaded.set_account(Some("owner")).unwrap();
        assert_eq!(
            reloaded.run_state("p", dir.path(), "t", "fp").unwrap(),
            Missing
        );
    }

    #[test]
    fn a_corrupt_approval_file_fails_closed() {
        let dir = tempfile::tempdir().unwrap();
        let state = dir.path().join("state");
        std::fs::create_dir_all(&state).unwrap();
        std::fs::write(state.join("preview-runs.json"), "{broken").unwrap();
        assert!(PreviewGrants::load(state).is_err());
    }
}
