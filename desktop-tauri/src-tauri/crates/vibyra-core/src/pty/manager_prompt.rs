//! Naming a pane after the work: the first request its agent was given.
use super::{PtyManager, SessionId};
use crate::error::CoreResult;

impl PtyManager {
    /// The first request sent to a session, or `None` before there is one.
    pub fn first_prompt(&self, id: SessionId) -> CoreResult<Option<String>> {
        Ok(self.session_ref(id)?.first_prompt())
    }
}
