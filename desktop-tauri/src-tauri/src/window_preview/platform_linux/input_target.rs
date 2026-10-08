//! Exact target focus immediately before each new OS input effect.
use super::conn::{text, X};
use super::inventory::ancestors;
use x11rb::protocol::xproto::ConnectionExt as _;

/// Uses the already-held connection; never recursively enters conn::with.
pub(super) fn focused(x: &X, id: u32) -> Result<(), String> {
    let active = x
        .conn
        .get_property(
            false,
            x.root,
            x.atoms.active,
            x11rb::protocol::xproto::AtomEnum::ANY,
            0,
            1,
        )
        .map_err(text)?
        .reply()
        .map_err(text)?;
    let active = active
        .value32()
        .map(Iterator::collect::<Vec<_>>)
        .unwrap_or_default();
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
    if !(focus == id || ancestors(x, focus).contains(&id)) {
        return Err(
            "A different window or dialog has focus. Return to the shared window on your computer."
                .into(),
        );
    }
    Ok(())
}
