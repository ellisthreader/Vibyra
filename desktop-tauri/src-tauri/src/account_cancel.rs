use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use parking_lot::Mutex;

/// A browser flow's cancellation flag: starting one cancels the previous
/// attempt, and finishing only clears the flag it was given. Two flows use
/// it — signing in with a provider, and deleting a provider account.
#[derive(Default)]
pub struct CancelFlag(Mutex<Option<Arc<AtomicBool>>>);

impl CancelFlag {
    pub fn begin(&self) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        if let Some(previous) = self.0.lock().replace(Arc::clone(&flag)) {
            previous.store(true, Ordering::SeqCst);
        }
        flag
    }

    pub fn cancel(&self) {
        if let Some(flag) = self.0.lock().take() {
            flag.store(true, Ordering::SeqCst);
        }
    }

    pub fn finish(&self, flag: &Arc<AtomicBool>) {
        let mut guard = self.0.lock();
        if guard
            .as_ref()
            .is_some_and(|current| Arc::ptr_eq(current, flag))
        {
            *guard = None;
        }
    }
}
