//! Queued Preview work retains the live connection, trust and lease boundary.
use crate::{backend::PreviewAccess, remote_authorization::Authorization, state::Shared};
use std::sync::{Arc, Weak};
use tokio::sync::Notify;

pub(super) struct ScopedPreview {
    pub(super) grant: Arc<Authorization>,
    pub(super) owner: Weak<Shared>,
    pub(super) device: String,
    pub(super) slot: Weak<Notify>,
}
impl PreviewAccess for ScopedPreview {
    fn permits(&self, permission: &str) -> bool {
        let (Some(owner), Some(slot)) = (self.owner.upgrade(), self.slot.upgrade()) else {
            return false;
        };
        self.grant.valid().is_ok()
            && self.grant.permits(permission)
            && owner.trusted(&self.device)
            && owner.active.lock().is_ok_and(|active| {
                active
                    .get(&self.device)
                    .is_some_and(|current| Arc::ptr_eq(current, &slot))
            })
    }
}

#[cfg(test)]
#[path = "preview_access_tests.rs"]
mod tests;
