use super::PhoneConnection;
use parking_lot::Mutex;
use std::{sync::Arc, thread, time::Duration};
use vibyra_core::pty::PtyManager;

const INTERVAL: Duration = Duration::from_secs(6);

/// Keeps an enabled connection bound to whatever network this Mac is on now.
/// Detection is a local routing-table lookup, so this costs nothing on the wire
/// and sends nothing until a phone actually connects.
pub fn watch(phone: Arc<Mutex<PhoneConnection>>, manager: Arc<PtyManager>) {
    let _ = thread::Builder::new()
        .name("vibyra-phone-network".into())
        .spawn(move || loop {
            thread::sleep(INTERVAL);
            phone.lock().refresh(manager.clone());
        });
}
