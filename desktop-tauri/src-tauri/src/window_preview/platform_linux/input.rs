//! XTest input to a shared window, only while it is active, focused, unmoved
//! and on top where the tap lands.

use super::conn::{text, X};
use super::input_target::focused;
use super::inventory::{ancestors, frame};
use super::keys::type_keysym;
use super::{Geometry, InputEvent};
use crate::window_preview::native::Key;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::ConnectionExt as _;
use x11rb::protocol::xtest::ConnectionExt as _;

pub(super) const KEY_PRESS: u8 = 2;
pub(super) const KEY_RELEASE: u8 = 3;
const BUTTON_PRESS: u8 = 4;
const BUTTON_RELEASE: u8 = 5;
const MOTION: u8 = 6;

pub(super) fn send(x: &X, window: &Geometry, event: &InputEvent) -> Result<(), String> {
    send_checked(
        x,
        window,
        event,
        &crate::window_preview::input_guard::denied,
    )
}

pub(super) fn send_checked(
    x: &X,
    window: &Geometry,
    event: &InputEvent,
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<(), String> {
    check()?;
    let id = window.info.id;
    super::front::bring_to_front(x, id, check)?;
    let targeted = || crate::window_preview::input_guard::require_target(check, || focused(x, id));
    targeted()?;
    let (left, top, width, height) = frame(x, id)?;
    if (left - window.x).abs() >= 1.0
        || (top - window.y).abs() >= 1.0
        || (width - window.width).abs() >= 1.0
        || (height - window.height).abs() >= 1.0
    {
        return Err("The window moved or resized. Close and reopen Preview to control it.".into());
    }
    match event {
        InputEvent::Click {
            x: px,
            y: py,
            right,
        } => {
            let point = aim(x, window, *px, *py)?;
            let button = if *right { 3 } else { 1 };
            fake(x, MOTION, 0, point, &targeted)?;
            fake(x, BUTTON_PRESS, button, point, &targeted)?;
            fake(x, BUTTON_RELEASE, button, point, &targeted)?;
        }
        InputEvent::Scroll {
            x: px,
            y: py,
            delta,
        } => {
            let point = aim(x, window, *px, *py)?;
            let button = if *delta > 0 { 4 } else { 5 };
            fake(x, MOTION, 0, point, &targeted)?;
            for _ in 0..(delta.unsigned_abs().div_ceil(100)).clamp(1, 6) {
                fake(x, BUTTON_PRESS, button, point, &targeted)?;
                fake(x, BUTTON_RELEASE, button, point, &targeted)?;
            }
        }
        InputEvent::Text(units) => {
            for character in char::decode_utf16(units.iter().copied()).filter_map(Result::ok) {
                let code = character as u32;
                type_keysym(
                    x,
                    if code <= 0xff {
                        code
                    } else {
                        0x0100_0000 | code
                    },
                    &targeted,
                )?;
            }
        }
        InputEvent::Key(key) => type_keysym(
            x,
            match key {
                Key::Enter => 0xff0d,
                Key::Tab => 0xff09,
                // ISO_Left_Tab sits on Tab's shifted level, so Shift is pressed with it.
                Key::ShiftTab => 0xfe20,
                Key::Escape => 0xff1b,
                Key::Backspace => 0xff08,
                Key::Delete => 0xffff,
                Key::Left => 0xff51,
                Key::Up => 0xff52,
                Key::Right => 0xff53,
                Key::Down => 0xff54,
                Key::PageUp => 0xff55,
                Key::PageDown => 0xff56,
            },
            &targeted,
        )?,
        // The dispatcher sends a batch one action at a time.
        InputEvent::Keys(_) => return Err("Unsupported window input.".into()),
    }
    x.conn.flush().map_err(text)
}

/// The root point for a phone coordinate, refused if another top-level
/// window or menu is what the pointer would hit there.
fn aim(x: &X, window: &Geometry, px: f64, py: f64) -> Result<(i16, i16), String> {
    let (rx, ry) = super::super::input::point(window, px, py);
    let point = (rx.round() as i16, ry.round() as i16);
    let hit = x
        .conn
        .translate_coordinates(x.root, x.root, point.0, point.1)
        .map_err(text)?
        .reply()
        .map_err(text)?
        .child;
    let own = std::iter::once(window.info.id)
        .chain(ancestors(x, window.info.id))
        .collect::<Vec<_>>();
    if !own.contains(&hit) {
        return Err(
            "Another window or menu is in front. Return to the shared window on your computer."
                .into(),
        );
    }
    Ok(point)
}

pub(super) fn fake(
    x: &X,
    kind: u8,
    detail: u8,
    (px, py): (i16, i16),
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<(), String> {
    if kind != KEY_RELEASE && kind != BUTTON_RELEASE {
        check()?;
    }
    x.conn
        .xtest_fake_input(kind, detail, 0, x.root, px, py, 0)
        .map(|_| ())
        .map_err(|_| "This computer's X server refused test input.".into())
}
