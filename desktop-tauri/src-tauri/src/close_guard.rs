//! Who gets to decide that the window closes.
//!
//! Closing is vetoed once so the workspace can warn about live terminals and
//! flush the session to disk first. That veto has to be conditional: it is
//! answered by a listener the *workspace* mounts, and the workspace is only
//! mounted once the account gate passes. Vetoing unconditionally meant the
//! sign-in screen emitted an event nothing was listening for, and the window
//! could not be closed at all — the user's only way out was to kill it.

use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::{Emitter, Manager, Window};

use crate::state::AppState;

/// How long the UI has to say it heard the close request.
///
/// This is not how long the user has to decide — the acknowledgement comes
/// before the confirm prompt is shown, and once it lands the window waits
/// indefinitely. It only bounds a webview that is still loading, has crashed,
/// or threw before its listener ran.
const ACK_GRACE: Duration = Duration::from_secs(4);

/// True when the UI should be asked first. False means close now: either the
/// user already confirmed, or nothing is mounted that could answer.
pub fn should_veto(state: &AppState) -> bool {
    !state.closing.load(Ordering::SeqCst) && state.close_guard_armed.load(Ordering::SeqCst)
}

/// Hands the decision to the UI, with a watchdog behind it.
pub fn hand_off(window: &Window) {
    window
        .state::<AppState>()
        .close_requested_ack
        .store(false, Ordering::SeqCst);
    let _ = window.emit("vibyra://close-requested", ());
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(ACK_GRACE).await;
        let state = window.state::<AppState>();
        if state.close_requested_ack.load(Ordering::SeqCst) || state.closing.load(Ordering::SeqCst)
        {
            return;
        }
        // Nothing answered, so nothing is going to. An unsaved session is a
        // bad outcome; a window the user cannot close is a worse one.
        state.closing.store(true, Ordering::SeqCst);
        let _ = window.close();
    });
}
