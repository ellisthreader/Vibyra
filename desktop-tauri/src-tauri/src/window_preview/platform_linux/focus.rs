//! Keyboard focus in a shared window over AT-SPI, for the phone's own
//! keyboard: what has focus in the window's application (and its web-content
//! processes), and where its text fields are. Field text is never read.

use super::atspi::{self, role, state, Object};
use super::{Field, Focused, Geometry};
use crate::window_preview::native::kind;
use dbus::blocking::Connection;
use std::cell::RefCell;

thread_local! {
    // D-Bus connections are not shared between threads.
    static BUS: RefCell<Option<Connection>> = const { RefCell::new(None) };
}

fn with_bus<T>(work: impl FnOnce(&Connection) -> T) -> Option<T> {
    BUS.with(|cell| {
        let mut bus = cell.borrow_mut();
        if bus.is_none() {
            *bus = atspi::connect().ok();
        }
        bus.as_ref().map(work)
    })
}

/// Whether `rect` shows inside the window.
fn inside([x, y, width, height]: [f64; 4], window: &Geometry) -> bool {
    x < window.x + window.width
        && y < window.y + window.height
        && x + width > window.x
        && y + height > window.y
}

pub(super) fn focused(window: &Geometry, front: bool) -> Focused {
    let elsewhere = |identity: &str| Focused {
        front,
        identity: identity.into(),
        field: None,
    };
    if !front {
        return elsewhere("elsewhere");
    }
    with_bus(|bus| {
        for app in atspi::applications(bus, window.info.pid as u32) {
            let Some(object) = atspi::matches(bus, &app, &[state::FOCUSED], &[], 1).pop() else {
                continue;
            };
            // Focus in another window of the same application does not count.
            let rect = atspi::extents(bus, &object);
            if rect.is_some_and(|rect| !inside(rect, window)) {
                continue;
            }
            return Focused {
                front,
                identity: format!("{}{}", object.0, object.1),
                field: describe(bus, &object, rect),
            };
        }
        elsewhere("none")
    })
    .unwrap_or_else(|| elsewhere("no-accessibility"))
}

/// The field, when the object takes typed text (a terminal always does).
fn describe(bus: &Connection, object: &Object, rect: Option<[f64; 4]>) -> Option<Field> {
    let words = atspi::object_states(bus, object);
    let role = atspi::object_role(bus, object).unwrap_or(0);
    let secure = role == role::PASSWORD_TEXT;
    let editable = atspi::has(&words, state::EDITABLE) && !atspi::has(&words, state::READ_ONLY);
    if !(editable || secure || role == role::TERMINAL) {
        return None;
    }
    let label = atspi::name(bus, object);
    Some(Field {
        kind: kind(secure, atspi::has(&words, state::MULTI_LINE), false, &label),
        rect,
        caret: atspi::caret(bus, object),
        label: label.chars().take(60).collect(),
        empty: None,
    })
}

/// The window's visible text boxes.
pub(super) fn fields(window: &Geometry) -> Vec<Field> {
    let roles = [
        role::ENTRY,
        role::PASSWORD_TEXT,
        role::TEXT,
        role::COMBO_BOX,
    ];
    with_bus(|bus| {
        let mut found = Vec::new();
        for app in atspi::applications(bus, window.info.pid as u32) {
            for object in atspi::matches(bus, &app, &[state::EDITABLE, state::SHOWING], &roles, 64)
            {
                let Some(rect) = atspi::extents(bus, &object).filter(|rect| inside(*rect, window))
                else {
                    continue;
                };
                let words = atspi::object_states(bus, &object);
                let secure = atspi::object_role(bus, &object) == Some(role::PASSWORD_TEXT);
                let label = atspi::name(bus, &object);
                found.push(Field {
                    kind: kind(secure, atspi::has(&words, state::MULTI_LINE), false, &label),
                    rect: Some(rect),
                    ..Field::default()
                });
                if found.len() >= 48 {
                    return found;
                }
            }
        }
        found
    })
    .unwrap_or_default()
}
