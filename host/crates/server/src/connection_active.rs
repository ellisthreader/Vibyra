//! Ownership of one confirmed connection per device.
use crate::state::Shared;
use std::sync::Arc;
use tokio::sync::Notify;

pub(super) struct ActiveDevice {
    pub(super) connection: u64,
    shared: Arc<Shared>,
    id: String,
    pub(super) takeover: Arc<Notify>,
}
impl ActiveDevice {
    /// Takes this device's single connection slot, asking whatever held it to
    /// stand down. A phone reconnecting after its Wi-Fi went is the ordinary
    /// case: the socket it left can look alive here long after the phone knows
    /// it is gone, and refusing the new one leaves nothing able to reach it.
    pub(super) fn claim(shared: &Arc<Shared>, id: &str) -> Result<Self, String> {
        static NEXT_CONNECTION: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
        let connection = NEXT_CONNECTION.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let takeover = Arc::new(Notify::new());
        let mut active = shared
            .active
            .lock()
            .map_err(|_| "Connections unavailable")?;
        if let Some(previous) = active.insert(id.to_owned(), takeover.clone()) {
            previous.notify_one();
        }
        shared.engine.connected(id, connection);
        Ok(Self {
            connection,
            shared: shared.clone(),
            id: id.to_owned(),
            takeover,
        })
    }
}
impl Drop for ActiveDevice {
    fn drop(&mut self) {
        // A newer connection from this same phone may already hold the slot.
        // Only the one that still owns it reports the device as gone, so a
        // reconnect does not release the terminal control it has just taken on.
        let owned = self
            .shared
            .active
            .lock()
            .map(|mut active| {
                let owned = active
                    .get(&self.id)
                    .is_some_and(|slot| Arc::ptr_eq(slot, &self.takeover));
                if owned {
                    active.remove(&self.id);
                }
                owned
            })
            .unwrap_or(false);
        if owned {
            self.shared
                .engine
                .disconnected_on_connection(&self.id, self.connection);
        }
    }
}
