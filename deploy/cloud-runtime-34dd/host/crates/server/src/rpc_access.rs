//! Carry live socket authority into delayed desktop effects without a device-wide grant.
use crate::{backend::PreviewAccess, remote_authorization::Access, state::Shared};
use std::{
    cell::RefCell,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Weak,
    },
};
use tokio::sync::Notify;

thread_local! {
    static CURRENT: RefCell<Option<Arc<dyn PreviewAccess>>> = RefCell::new(None);
}

/// The current authenticated RPC's live authority. Capture it before queueing work.
#[allow(dead_code)] // Consumed by embedded desktop effects; the standalone binary has none.
pub fn current_rpc_access() -> Option<Arc<dyn PreviewAccess>> {
    CURRENT.with(|current| current.borrow().clone())
}

#[cfg(test)]
#[path = "rpc_access_tests.rs"]
mod tests;

/// Scope synchronous backend dispatch; delayed work must retain the captured value.
pub fn with_rpc_access<T>(access: Arc<dyn PreviewAccess>, run: impl FnOnce() -> T) -> T {
    struct Restore(Option<Arc<dyn PreviewAccess>>);
    impl Drop for Restore {
        fn drop(&mut self) {
            CURRENT.with(|current| *current.borrow_mut() = self.0.take());
        }
    }
    let _restore = Restore(CURRENT.with(|current| current.replace(Some(access))));
    run()
}

pub(crate) struct ScopedRpc {
    pub(crate) grant: Access,
    pub(crate) owner: Weak<Shared>,
    pub(crate) device: String,
    pub(crate) slot: Weak<Notify>,
    pub(crate) lan_generation: Option<u64>,
    pub(crate) alive: Arc<AtomicBool>,
}
pub(crate) struct RpcLifetime(pub(crate) Arc<AtomicBool>);
impl RpcLifetime {
    pub(crate) fn new() -> Self {
        Self(Arc::new(AtomicBool::new(true)))
    }
}
impl Drop for RpcLifetime {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
impl ScopedRpc {
    pub(crate) fn live(&self) -> bool {
        let (Some(owner), Some(slot)) = (self.owner.upgrade(), self.slot.upgrade()) else {
            return false;
        };
        self.alive.load(Ordering::SeqCst)
            && !self.lan_generation.is_some_and(|generation| {
                owner
                    .lan_generation
                    .load(std::sync::atomic::Ordering::SeqCst)
                    != generation
            })
            && self
                .grant
                .as_ref()
                .is_none_or(|grant| grant.valid().is_ok())
            && owner.trusted(&self.device)
            && owner.active.lock().is_ok_and(|active| {
                active
                    .get(&self.device)
                    .is_some_and(|current| Arc::ptr_eq(current, &slot))
            })
    }
}
impl PreviewAccess for ScopedRpc {
    fn permits(&self, permission: &str) -> bool {
        self.live()
            && self
                .grant
                .as_ref()
                .is_none_or(|grant| grant.permits(permission))
    }
}
