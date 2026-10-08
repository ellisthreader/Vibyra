//! The per-project tick for Vibyra Cloud and the conversations it sent back (docs/cloud-access-contract.md).
use super::{Engine, ProjectRef};
use crate::error::Result;
use crate::paths::project_key;
use crate::returned::ReturnedSession;

impl Engine {
    /// Ticks (`allowed`) or unticks a project for Vibyra Cloud. Unticking makes the server delete the cloud
    /// copy, so this Mac forgets its sync state for it too (a later tick starts with a fresh upload).
    pub fn set_project_access(&self, project: &ProjectRef, allowed: bool) -> Result<()> {
        self.client
            .put_project_access(&project.id, &project.name, allowed)?;
        if !allowed {
            let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
            self.store.remove(&project_key(&project.id));
        }
        Ok(())
    }

    /// Conversations Vibyra Cloud continued for this project, newest first, and the newest `cloudAt` the
    /// person has already seen the notice for.
    pub fn returned_sessions(&self, project: &ProjectRef) -> (Vec<ReturnedSession>, u64) {
        let st = self.project_status(project);
        (st.returned, st.returned_seen_at)
    }

    /// The notice was seen: conversations the cloud sent back up to now no longer count as new.
    pub fn dismiss_returned(&self, project: &ProjectRef) -> Result<()> {
        let _g = self.lock.lock().unwrap_or_else(|e| e.into_inner());
        let mut st = self.store.load(&project_key(&project.id));
        let newest = st.returned.iter().map(|s| s.cloud_at).max().unwrap_or(0);
        if newest <= st.returned_seen_at {
            return Ok(());
        }
        st.returned_seen_at = newest;
        self.store.save(&st)
    }
}
