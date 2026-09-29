//! Asks the window manager to activate the shared window before a phone tap,
//! the way a taskbar does; the usual checks still confirm it before input.

use super::conn::X;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ClientMessageEvent, ConnectionExt as _, EventMask, Window};

/// Source 2: a pager or taskbar acting for the user, which EWMH window
/// managers honour without focus-stealing prevention.
const FROM_PAGER: u32 = 2;

pub(super) fn bring_to_front(x: &X, window: Window) {
    let active = x.property32(x.root, x.atoms.active);
    // No window manager publishes an active window: nothing to ask.
    if active.first().is_none_or(|current| *current == window) {
        return;
    }
    let request = ClientMessageEvent::new(32, window, x.atoms.active, [FROM_PAGER, 0, 0, 0, 0]);
    let mask = EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY;
    if x.conn.send_event(false, x.root, mask, request).is_err() || x.conn.flush().is_err() {
        return;
    }
    for _ in 0..10 {
        if x.property32(x.root, x.atoms.active).first() == Some(&window) {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(40));
    }
}
