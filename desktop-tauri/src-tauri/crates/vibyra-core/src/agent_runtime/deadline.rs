use super::TurnHandle;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    mpsc, Arc,
};
use std::time::Duration;

/// The deadline also covers a provider parked at an approval prompt.
pub struct Deadline {
    stop: mpsc::Sender<()>,
    expired: Arc<AtomicBool>,
}
impl Deadline {
    pub fn start(handle: TurnHandle, duration: Duration) -> Self {
        let (stop, receive) = mpsc::channel();
        let expired = Arc::new(AtomicBool::new(false));
        let flag = Arc::clone(&expired);
        std::thread::spawn(move || {
            if receive.recv_timeout(duration) == Err(mpsc::RecvTimeoutError::Timeout) {
                flag.store(true, Ordering::SeqCst);
                handle.cancel();
            }
        });
        Self { stop, expired }
    }
    pub fn expired(&self) -> bool {
        self.expired.load(Ordering::SeqCst)
    }
}
impl Drop for Deadline {
    fn drop(&mut self) {
        let _ = self.stop.send(());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn deadline_cancels_and_drop_disarms() {
        let handle = TurnHandle::new();
        let deadline = Deadline::start(handle.clone(), Duration::from_millis(10));
        std::thread::sleep(Duration::from_millis(40));
        assert!(deadline.expired() && handle.cancelled());
        let handle = TurnHandle::new();
        drop(Deadline::start(handle.clone(), Duration::from_millis(10)));
        std::thread::sleep(Duration::from_millis(40));
        assert!(!handle.cancelled());
    }
}
