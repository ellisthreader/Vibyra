//! Keyboard mapping and paired XTest cleanup for one authorized request.
use super::conn::{text, X};
use super::input::{fake, KEY_PRESS, KEY_RELEASE};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{ConnectionExt as _, Keycode, Keysym};
const SHIFT: Keysym = 0xffe1;

/// Presses a keysym: its own key (with Shift when on the shifted level), or a
/// spare keycode borrowed for the moment and then given back.
pub(super) fn type_keysym(
    x: &X,
    keysym: Keysym,
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<(), String> {
    check()?;
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
        fake(x, KEY_PRESS, code, (0, 0), check)?;
        fake(x, KEY_RELEASE, code, (0, 0), check)
    };
    if let Some(index) = map.keysyms.iter().position(|sym| *sym == keysym) {
        if index % per == 1 {
            let shift = map.keysyms.iter().position(|sym| *sym == SHIFT).map(key);
            let shift = shift.ok_or("No Shift key is mapped")?;
            fake(x, KEY_PRESS, shift, (0, 0), check)?;
            let typed = press(key(index));
            let released = fake(x, KEY_RELEASE, shift, (0, 0), check);
            return typed.and(released);
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
    check()?;
    x.conn
        .change_keyboard_mapping(1, code, per as u8, &syms)
        .map_err(text)?;
    let typed = (|| {
        x.conn
            .get_input_focus()
            .map_err(text)?
            .reply()
            .map_err(text)?;
        // Clients read the new mapping before the key arrives.
        std::thread::sleep(std::time::Duration::from_millis(20));
        press(code)
    })();
    // Restore only the mapping this request successfully borrowed, even on
    // permission loss or a failed read after the mapping changed.
    let restored = x
        .conn
        .change_keyboard_mapping(1, code, per as u8, &vec![0; per])
        .map_err(text)
        .and_then(|_| x.conn.flush().map_err(text));
    typed.and(restored)
}
