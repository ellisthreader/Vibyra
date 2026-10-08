//! A phone's explicit Run also shares that exact managed website for this run.
use super::{run_control::RunTarget, PreviewService};
use vibyra_core::preview::PreviewTargetKind;

impl PreviewService {
    pub(super) fn refresh_run_site(&self, root: &std::path::Path, target: &str) {
        let tracked = self
            .inner
            .runs
            .lock()
            .get(&(root.to_owned(), target.to_owned()))
            .is_some_and(|run| run.ended.is_none());
        if !tracked {
            return;
        }
        let Some(folder) = root.to_str() else {
            return;
        };
        if let Ok((status, Some(runtime_id))) =
            self.inner.manager.status_with_runtime(folder, target)
        {
            self.on_run_event(vibyra_core::preview::PreviewEvent {
                root: folder.into(),
                target_id: target.into(),
                runtime_id,
                status,
            });
        }
    }

    pub(super) fn share_run_site(
        &self,
        owner: Option<&str>,
        target: &RunTarget,
    ) -> Result<(), String> {
        let Some(owner) = owner else {
            return Ok(());
        };
        if target.target.kind == PreviewTargetKind::Desktop {
            return Ok(());
        }
        let key = (target.source_root.clone(), target.target.id.clone());
        let (run_id, account) = self
            .inner
            .runs
            .lock()
            .get(&key)
            .filter(|run| run.ended.is_none())
            .map(|run| (run.run_id.clone(), run.account.clone()))
            .ok_or("The run ended")?;
        if self.inner.grants.active_account()? != account {
            return Err("The account changed".into());
        }
        let grant = self.inner.grants.grant_run_site(
            owner,
            &target.project_id,
            &target.source_root,
            &target.target.id,
            &run_id,
            &account,
        )?;
        let mut runs = self.inner.runs.lock();
        if let Some(run) = runs
            .get_mut(&key)
            .filter(|run| run.run_id == run_id && run.ended.is_none())
        {
            run.windows
                .insert((owner.into(), target.target.id.clone()), grant);
        } else {
            drop(runs);
            self.inner.grants.revoke_run(&run_id)?;
            return Err("The run ended".into());
        }
        Ok(())
    }
}
