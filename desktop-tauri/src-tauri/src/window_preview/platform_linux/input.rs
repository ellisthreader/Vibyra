//! XTest input to a shared window, only while it is active, focused, unmoved
//! and on top where the tap lands.

use super::conn::{text, X};
use super::inventory::{ancestors, frame};
use super::{Geometry, InputEvent};
use crate::window_preview::native::Key;
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt as _, Keycode, Keysym};
use x11rb::protocol::xtest::ConnectionExt as _;

const KEY_PRESS: u8 = 2;
const KEY_RELEASE: u8 = 3;
const BUTTON_PRESS: u8 = 4;
const BUTTON_RELEASE: u8 = 5;
const MOTION: u8 = 6;
const SHIFT: Keysym = 0xffe1;

pub(super) fn send(x: &X, window: &Geometry, event: &InputEvent) -> Result<(), String> {
    let id = window.info.id;
    super::front::bring_to_front(x, id);
    let active = x.property32(x.root, x.atoms.active);
    if active.first().is_some_and(|active| *active != id) {
        return Err("Bring the shared application window to the front on your computer before controlling it.".into());
    }
    let focus = x
        .conn
        .get_input_focus()
        .map_err(text)?
        .reply()
        .map_err(text)?
        .focus;
    if !(focus == id || ancestors(x, focus).contains(&id) || (active.is_empty() && focus == 1)) {
        return Err(
            "A different window or dialog has focus. Return to the shared window on your computer."
                .into(),
        );
    }
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
            fake(x, MOTION, 0, point)?;
            fake(x, BUTTON_PRESS, button, point)?;
            fake(x, BUTTON_RELEASE, button, point)?;
        }
        InputEvent::Scroll {
            x: px,
            y: py,
            delta,
        } => {
            let point = aim(x, window, *px, *py)?;
            let button = if *delta > 0 { 4 } else { 5 };
            fake(x, MOTION, 0, point)?;
            for _ in 0..(delta.unsigned_abs().div_ceil(100)).clamp(1, 6) {
                fake(x, BUTTON_PRESS, button, point)?;
                fake(x, BUTTON_RELEASE, button, point)?;
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

fn fake(x: &X, kind: u8, detail: u8, (px, py): (i16, i16)) -> Result<(), String> {
    x.conn
        .xtest_fake_input(kind, detail, 0, x.root, px, py, 0)
        .map(|_| ())
        .map_err(|_| "This computer's X server refused test input.".into())
}

/// Presses a keysym: its own key (with Shift when on the shifted level), or a
/// spare keycode borrowed for the moment and then given back.
fn type_keysym(x: &X, keysym: Keysym) -> Result<(), String> {
    let setup = x.conn.setup();
    let (first, last) = (setup.min_keycode, setup.max_keycode);
    let map = x
        .conn
        .get_keyboard_mapping(first, last - first + 1)
        .map_err(text)?
        .reply()
        .map_err(text)?;
    let per = usize::from(map.keysyms_per_keycode.max(1));
    let key = |index: usize| first + (index / per) as Keycode;
    let press = |code: Keycode| -> Result<(), String> {
        fake(x, KEY_PRESS, code, (0, 0))?;
        fake(x, KEY_RELEASE, code, (0, 0))
    };
    if let Some(index) = map.keysyms.iter().position(|sym| *sym == keysym) {
        if index % per == 1 {
            let shift = map.keysyms.iter().position(|sym| *sym == SHIFT).map(key);
            let shift = shift.ok_or("No Shift key is mapped")?;
            fake(x, KEY_PRESS, shift, (0, 0))?;
            press(key(index))?;
            return fake(x, KEY_RELEASE, shift, (0, 0));
        }
        return press(key(index));
    }
    let spare = map
        .keysyms
        .chunks(per)
        .position(|syms| syms.iter().all(|sym| *sym == 0));
    let spare = spare.ok_or("No spare key is free to type this character")?;
    let code = first + spare as Keycode;
    let mut syms = vec![0; per];
    syms[0] = keysym;
    syms[1.min(per - 1)] = keysym;
    x.conn
        .change_keyboard_mapping(1, code, per as u8, &syms)
        .map_err(text)?;
    x.conn
        .get_input_focus()
        .map_err(text)?
        .reply()
        .map_err(text)?;
    // Clients read the new mapping before the key arrives.
    std::thread::sleep(std::time::Duration::from_millis(20));
    let typed = press(code);
    x.conn
        .get_input_focus()
        .map_err(text)?
        .reply()
        .map_err(text)?;
    x.conn
        .change_keyboard_mapping(1, code, per as u8, &vec![0; per])
        .map_err(text)?;
    typed
}
