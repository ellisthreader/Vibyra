//! Application windows on X11 and their identity: the owning pid as the X
//! server reports it (XRes), its /proc start time and boot, and the window ID.

use super::conn::{text, X};
use super::Geometry;
use crate::window_preview::WindowInfo;
use x11rb::protocol::res::{ClientIdMask, ClientIdSpec, ConnectionExt as _};
use x11rb::protocol::xproto::{ConnectionExt as _, MapState, Window, WindowClass};

const MAX_WINDOWS: usize = 256;
const MIN_SIZE: f64 = 32.0;

pub(super) fn list(x: &X) -> Result<Vec<Geometry>, String> {
    let mut windows = x.property32(x.root, x.atoms.client_list);
    if windows.is_empty() {
        // No window manager (a bare Xvfb): the root's mapped children.
        let tree = x
            .conn
            .query_tree(x.root)
            .map_err(text)?
            .reply()
            .map_err(text)?;
        windows = tree.children;
    }
    Ok(windows
        .into_iter()
        .filter_map(|window| describe(x, window).ok())
        .take(MAX_WINDOWS)
        .collect())
}

pub(super) fn info(x: &X, id: u32) -> Result<Geometry, String> {
    describe(x, id).map_err(|_| {
        "This application window closed or is unavailable. Select it again on your computer.".into()
    })
}

fn describe(x: &X, window: Window) -> Result<Geometry, String> {
    let attributes = x
        .conn
        .get_window_attributes(window)
        .map_err(text)?
        .reply()
        .map_err(text)?;
    if attributes.class != WindowClass::INPUT_OUTPUT || attributes.override_redirect {
        return Err("not an application window".into());
    }
    let kinds = x.property32(window, x.atoms.kind);
    if !kinds.is_empty()
        && !kinds
            .iter()
            .any(|k| *k == x.atoms.normal || *k == x.atoms.dialog)
    {
        return Err("not an application window".into());
    }
    let listed = !x.property32(x.root, x.atoms.client_list).is_empty();
    if !listed && attributes.map_state != MapState::VIEWABLE {
        return Err("not shown".into());
    }
    let (left, top, width, height) = frame(x, window)?;
    if width < MIN_SIZE || height < MIN_SIZE {
        return Err("too small".into());
    }
    let pid = pid(x, window).ok_or("no process")?;
    let (start, boot) = start(pid).ok_or("no process start")?;
    let title = x
        .property_text(window, x.atoms.name)
        .or_else(|| x.property_text(window, x11rb::protocol::xproto::AtomEnum::WM_NAME.into()))
        .unwrap_or_default();
    let name = x
        .property_text(window, x11rb::protocol::xproto::AtomEnum::WM_CLASS.into())
        .and_then(|class| class.split('\0').nth(1).map(str::to_owned))
        .filter(|class| !class.is_empty())
        .or_else(|| std::fs::read_to_string(format!("/proc/{pid}/comm")).ok())
        .map(|name| name.trim().to_owned())
        .unwrap_or_else(|| format!("Process {pid}"));
    Ok(Geometry {
        info: WindowInfo {
            id: window,
            pid: pid as i32,
            name,
            title,
            fingerprint: format!("{pid}:{start}:{boot}:{window}"),
        },
        x: left,
        y: top,
        width,
        height,
    })
}

/// The window's area on the root, without a GTK client-side shadow.
pub(super) fn frame(x: &X, window: Window) -> Result<(f64, f64, f64, f64), String> {
    let geometry = x
        .conn
        .get_geometry(window)
        .map_err(text)?
        .reply()
        .map_err(text)?;
    let origin = x
        .conn
        .translate_coordinates(window, x.root, 0, 0)
        .map_err(text)?
        .reply()
        .map_err(text)?;
    let extents = x.property32(window, x.atoms.frame_extents);
    let [left, right, top, bottom] = match extents.as_slice() {
        [l, r, t, b] => [*l, *r, *t, *b].map(f64::from),
        _ => [0.0; 4],
    };
    Ok((
        f64::from(origin.dst_x) + left,
        f64::from(origin.dst_y) + top,
        (f64::from(geometry.width) - left - right).max(0.0),
        (f64::from(geometry.height) - top - bottom).max(0.0),
    ))
}

/// The pid the X server saw connect, which a client cannot fake; the
/// window's own `_NET_WM_PID` claim only when the server cannot say.
fn pid(x: &X, window: Window) -> Option<u32> {
    let spec = ClientIdSpec {
        client: window,
        mask: ClientIdMask::LOCAL_CLIENT_PID,
    };
    let reported = x
        .conn
        .res_query_client_ids(&[spec])
        .ok()
        .and_then(|cookie| cookie.reply().ok())
        .and_then(|reply| reply.ids.first().and_then(|id| id.value.first().copied()));
    reported.or_else(|| x.property32(window, x.atoms.pid).first().copied())
}

/// Clock ticks since boot (field 22 of /proc/pid/stat) plus this boot's ID,
/// so a pid reused after exit or reboot never matches.
pub(super) fn start(pid: u32) -> Option<(u64, String)> {
    let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let after_name = &stat[stat.rfind(") ")? + 2..];
    let start = after_name.split_whitespace().nth(19)?.parse().ok()?;
    let boot = std::fs::read_to_string("/proc/sys/kernel/random/boot_id")
        .unwrap_or_default()
        .chars()
        .take(8)
        .collect();
    Some((start, boot))
}

/// Why a shared window cannot be seen right now, if it cannot.
pub(super) fn visible_problem(x: &X, window: Window) -> Result<(), String> {
    let attributes = x
        .conn
        .get_window_attributes(window)
        .map_err(text)?
        .reply()
        .map_err(text)?;
    let hidden = x
        .property32(window, x.atoms.state)
        .contains(&x.atoms.hidden);
    if hidden || attributes.map_state != MapState::VIEWABLE {
        return Err("The window is minimized or on another workspace. Show it on your computer to preview it.".into());
    }
    Ok(())
}

/// The windows above `window`, up to (not including) the root.
pub(super) fn ancestors(x: &X, mut window: Window) -> Vec<Window> {
    let mut found = Vec::new();
    for _ in 0..32 {
        let Some(tree) = x.conn.query_tree(window).ok().and_then(|c| c.reply().ok()) else {
            break;
        };
        if tree.parent == 0 || tree.parent == x.root {
            break;
        }
        found.push(tree.parent);
        window = tree.parent;
    }
    found
}
