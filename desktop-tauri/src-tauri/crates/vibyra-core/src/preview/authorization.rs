//! Scoped launch checks survive filesystem preparation and operation-lock waits.
use crate::CoreResult;
use std::{cell::RefCell, sync::Arc};

pub type LaunchAuthorization = Arc<dyn Fn(bool) -> CoreResult<()> + Send + Sync>;
thread_local! {
    static CURRENT: RefCell<Option<LaunchAuthorization>> = RefCell::new(None);
}
pub fn with_launch_authorization<T>(check: LaunchAuthorization, run: impl FnOnce() -> T) -> T {
    struct Restore(Option<LaunchAuthorization>);
    impl Drop for Restore {
        fn drop(&mut self) {
            CURRENT.with(|current| *current.borrow_mut() = self.0.take());
        }
    }
    let previous = CURRENT.with(|current| current.borrow().clone());
    let combined = Arc::new(move |process| {
        if let Some(previous) = &previous {
            previous(process)?;
        }
        check(process)
    });
    let _restore = Restore(CURRENT.with(|current| current.replace(Some(combined))));
    run()
}
pub(super) fn check(process: bool) -> CoreResult<()> {
    let check = CURRENT.with(|current| current.borrow().clone());
    check.map_or(Ok(()), |check| check(process))
}
/// Shared by native process and workspace effects inside a scoped phone launch.
pub fn check_privileged_effect() -> CoreResult<()> {
    check(true)
}
