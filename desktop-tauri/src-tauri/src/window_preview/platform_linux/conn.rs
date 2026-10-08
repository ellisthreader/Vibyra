//! One cached X connection for inventory and input (capture threads open
//! their own). Under a Wayland desktop this is XWayland, which serves the
//! apps Vibyra starts on X11.

use parking_lot::Mutex;
use std::sync::OnceLock;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{Atom, ConnectionExt as _, Window};
use x11rb::rust_connection::RustConnection;

pub(super) struct X {
    pub conn: RustConnection,
    pub root: Window,
    pub atoms: Atoms,
}

pub(super) struct Atoms {
    pub client_list: Atom,
    pub active: Atom,
    pub pid: Atom,
    pub name: Atom,
    pub state: Atom,
    pub hidden: Atom,
    pub kind: Atom,
    pub normal: Atom,
    pub dialog: Atom,
    pub frame_extents: Atom,
}

pub(super) fn text<E: std::fmt::Display>(error: E) -> String {
    error.to_string()
}

pub(super) fn connect() -> Result<X, String> {
    let (conn, screen) = RustConnection::connect(None)
        .map_err(|_| "Vibyra needs an X11 or XWayland display to preview windows.".to_string())?;
    let root = conn.setup().roots.get(screen).ok_or("No X11 screen")?.root;
    let atom = |name: &[u8]| -> Result<Atom, String> {
        Ok(conn
            .intern_atom(false, name)
            .map_err(text)?
            .reply()
            .map_err(text)?
            .atom)
    };
    let atoms = Atoms {
        client_list: atom(b"_NET_CLIENT_LIST")?,
        active: atom(b"_NET_ACTIVE_WINDOW")?,
        pid: atom(b"_NET_WM_PID")?,
        name: atom(b"_NET_WM_NAME")?,
        state: atom(b"_NET_WM_STATE")?,
        hidden: atom(b"_NET_WM_STATE_HIDDEN")?,
        kind: atom(b"_NET_WM_WINDOW_TYPE")?,
        normal: atom(b"_NET_WM_WINDOW_TYPE_NORMAL")?,
        dialog: atom(b"_NET_WM_WINDOW_TYPE_DIALOG")?,
        frame_extents: atom(b"_GTK_FRAME_EXTENTS")?,
    };
    Ok(X { conn, root, atoms })
}

/// Runs `work` on the shared connection, reconnecting after any failure so a
/// restarted X server or XWayland is picked up on the next call.
pub(super) fn with<T>(work: impl FnOnce(&X) -> Result<T, String>) -> Result<T, String> {
    static SHARED: OnceLock<Mutex<Option<X>>> = OnceLock::new();
    let mut shared = SHARED.get_or_init(Default::default).lock();
    if shared.is_none() {
        *shared = Some(connect()?);
    }
    let result = work(shared.as_ref().unwrap());
    if result.is_err() && shared.as_ref().is_some_and(|x| x.conn.flush().is_err()) {
        *shared = None;
    }
    result
}

impl X {
    pub fn property32(&self, window: Window, name: Atom) -> Vec<u32> {
        self.conn
            .get_property(
                false,
                window,
                name,
                x11rb::protocol::xproto::AtomEnum::ANY,
                0,
                1024,
            )
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .and_then(|reply| reply.value32().map(Iterator::collect))
            .unwrap_or_default()
    }

    pub fn property_text(&self, window: Window, name: Atom) -> Option<String> {
        let reply = self
            .conn
            .get_property(
                false,
                window,
                name,
                x11rb::protocol::xproto::AtomEnum::ANY,
                0,
                1024,
            )
            .ok()?
            .reply()
            .ok()?;
        (!reply.value.is_empty()).then(|| String::from_utf8_lossy(&reply.value).into_owned())
    }
}
