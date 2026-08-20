//! One cached X11 connection shared by every screen capture.
//!
//! Each capture used to open four separate connections — opacity off, grab,
//! opacity on, activate — and every one of them re-ran the socket connect, the
//! Xauthority read and the full setup handshake before doing any work. The
//! session below is opened once, reused, and reopened only if the server hands
//! back an error (display switch, server restart).

use parking_lot::Mutex;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{Atom, ConnectionExt as _, Window};
use x11rb::rust_connection::RustConnection;

pub struct X11Session {
    pub conn: RustConnection,
    pub root: Window,
    pub screen_width: u16,
    pub screen_height: u16,
    /// `_NET_WM_WINDOW_OPACITY`, honoured only by a compositing window manager.
    pub opacity: Atom,
    pub active_window: Atom,
}

static SESSION: Mutex<Option<X11Session>> = parking_lot::const_mutex(None);

fn intern(conn: &RustConnection, name: &[u8]) -> Result<Atom, String> {
    Ok(conn
        .intern_atom(false, name)
        .map_err(|e| e.to_string())?
        .reply()
        .map_err(|e| e.to_string())?
        .atom)
}

fn open() -> Result<X11Session, String> {
    let (conn, screen_num) = x11rb::connect(None).map_err(|e| format!("X11 connect: {e}"))?;
    let screen = &conn.setup().roots[screen_num];
    let (root, screen_width, screen_height) =
        (screen.root, screen.width_in_pixels, screen.height_in_pixels);
    let opacity = intern(&conn, b"_NET_WM_WINDOW_OPACITY")?;
    let active_window = intern(&conn, b"_NET_ACTIVE_WINDOW")?;
    Ok(X11Session {
        conn,
        root,
        screen_width,
        screen_height,
        opacity,
        active_window,
    })
}

/// Runs `action` against the cached session, reopening once if the cached
/// connection has gone away. The retry only costs a handshake on the error
/// path; the happy path never reconnects.
pub fn with_session<T>(action: impl Fn(&X11Session) -> Result<T, String>) -> Result<T, String> {
    let mut slot = SESSION.lock();
    if slot.is_none() {
        *slot = Some(open()?);
    }
    let first = match action(slot.as_ref().expect("session opened")) {
        Ok(value) => return Ok(value),
        Err(error) => error,
    };
    *slot = Some(open().map_err(|_| first)?);
    action(slot.as_ref().expect("session reopened"))
}
