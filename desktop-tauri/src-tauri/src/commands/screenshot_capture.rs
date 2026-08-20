//! X11 screen capture for the screenshot shortcut.
//!
//! The capture is what is actually on the monitor under the pointer, Vibyra's
//! own window included — the editor is only mounted once the pixels are back,
//! so it can never appear in its own screenshot. Users who want the window out
//! of the way opt into `screenshot_hide_window`, which asks the compositor to
//! take the window to zero opacity for the length of one grab.

use image::RgbaImage;
use raw_window_handle::{HasWindowHandle, RawWindowHandle};
use x11rb::connection::Connection;
use x11rb::protocol::randr::ConnectionExt as _;
use x11rb::protocol::xproto::{
    AtomEnum, ClientMessageData, ClientMessageEvent, ConnectionExt as _, EventMask, ImageFormat,
    PropMode,
};
use x11rb::wrapper::ConnectionExt as _;

use super::screenshot_x11::with_session;

/// Two compositor frames at 60 Hz — long enough for the opacity change to land
/// on screen, and only paid for when the user opts into hiding the window.
const COMPOSITOR_SETTLE_MS: u64 = 34;

fn x11_window_id(window: &tauri::Window) -> Result<u32, String> {
    let handle = window.window_handle().map_err(|e| e.to_string())?;
    match handle.as_raw() {
        RawWindowHandle::Xlib(handle) => Ok(handle.window as u32),
        RawWindowHandle::Xcb(handle) => Ok(handle.window.get()),
        _ => Err("Screenshot capture needs an X11 window.".to_string()),
    }
}

fn set_x11_opacity(window_id: u32, opacity: u32) -> Result<(), String> {
    with_session(|session| {
        session
            .conn
            .change_property32(
                PropMode::REPLACE,
                window_id,
                session.opacity,
                AtomEnum::CARDINAL,
                &[opacity],
            )
            .map_err(|e| e.to_string())?
            .check()
            .map_err(|e| e.to_string())?;
        session.conn.flush().map_err(|e| e.to_string())
    })
}

fn activate_x11_window(window_id: u32) -> Result<(), String> {
    with_session(|session| {
        let event = ClientMessageEvent::new(
            32,
            window_id,
            session.active_window,
            ClientMessageData::from([2, 0, 0, 0, 0]),
        );
        session
            .conn
            .send_event(
                false,
                session.root,
                EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
                event,
            )
            .map_err(|e| e.to_string())?
            .check()
            .map_err(|e| e.to_string())?;
        session.conn.flush().map_err(|e| e.to_string())
    })
}

pub fn grab_pointer_monitor() -> Result<RgbaImage, String> {
    let (width, height, mut rgba) = with_session(|session| {
        let conn = &session.conn;
        let pointer = conn
            .query_pointer(session.root)
            .map_err(|e| format!("pointer query: {e}"))?
            .reply()
            .map_err(|e| format!("pointer query: {e}"))?;
        let monitors = conn
            .randr_get_monitors(session.root, true)
            .ok()
            .and_then(|cookie| cookie.reply().ok())
            .map(|reply| reply.monitors)
            .unwrap_or_default();
        let px = i32::from(pointer.root_x);
        let py = i32::from(pointer.root_y);
        let monitor = monitors
            .iter()
            .find(|item| {
                px >= i32::from(item.x)
                    && px < i32::from(item.x) + i32::from(item.width)
                    && py >= i32::from(item.y)
                    && py < i32::from(item.y) + i32::from(item.height)
            })
            .or_else(|| monitors.iter().find(|item| item.primary))
            .or_else(|| monitors.first());
        let (x, y, width, height) = monitor
            .map(|item| (item.x, item.y, item.width, item.height))
            .unwrap_or((0, 0, session.screen_width, session.screen_height));
        let reply = conn
            .get_image(ImageFormat::Z_PIXMAP, session.root, x, y, width, height, !0)
            .map_err(|e| format!("screen capture: {e}"))?
            .reply()
            .map_err(|e| format!("screen capture: {e}"))?;
        Ok((width, height, reply.data))
    })?;
    for pixel in rgba.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    RgbaImage::from_raw(width.into(), height.into(), rgba)
        .ok_or_else(|| "The display returned an invalid capture buffer.".to_string())
}

/// Grabs the pointer's monitor and raises Vibyra so the editor is usable when
/// the shortcut fired from another application. The window is neither resized
/// nor forced fullscreen: the editor is an overlay inside the existing window,
/// and toggling fullscreen re-lays out every live terminal twice per capture.
pub fn capture_screen_image(
    window: &tauri::Window,
    hide_window: bool,
) -> Result<RgbaImage, String> {
    let window_id = x11_window_id(window)?;
    let mut restored = Ok(());
    let captured = if hide_window {
        set_x11_opacity(window_id, 0)?;
        std::thread::sleep(std::time::Duration::from_millis(COMPOSITOR_SETTLE_MS));
        let captured = grab_pointer_monitor();
        restored = set_x11_opacity(window_id, u32::MAX);
        captured
    } else {
        grab_pointer_monitor()
    };
    let _ = window.unminimize();
    let _ = activate_x11_window(window_id);
    restored?;
    captured
}

pub fn finish_capture_session(window: &tauri::Window) {
    if let Ok(window_id) = x11_window_id(window) {
        let _ = set_x11_opacity(window_id, u32::MAX);
    }
}
