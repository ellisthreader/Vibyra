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

/// Lets the window hear at once when a phone asks it to start or close a
/// terminal, rather than on its next poll: the phone is waiting on the answer.
pub fn notify_window(app: tauri::AppHandle) {
    use tauri::{Emitter, Manager};
    let state = app.state::<crate::state::AppState>();
    let requests = state.phone.lock().requests.clone();
    requests.attach(Box::new(move |request| {
        let _ = app.emit("phone:terminal-request", request);
    }));
}
