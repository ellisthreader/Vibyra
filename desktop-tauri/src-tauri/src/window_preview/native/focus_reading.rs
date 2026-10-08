//! Application focus and field-map reads, called only by the single reader.
use super::super::fields::fraction;
use super::{Backend, Geometry, Seen, RESCAN};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::time::Instant;

pub(super) fn measure(
    seen: &Mutex<Seen>,
    backend: &'static dyn Backend,
    window: &Geometry,
) -> Value {
    let focused = backend.focus(window).unwrap_or_default();
    let field = focused.field.as_ref();
    let mut state = json!({
        "v": 1, "access": true, "front": focused.front,
        "editable": field.is_some(), "kind": field.map_or("text", |f| f.kind),
    });
    if let Some(field) = field {
        state["label"] = json!(field.label.chars().take(60).collect::<String>());
        if let Some(empty) = field.empty {
            state["empty"] = json!(empty);
        }
        if let Some(rect) = field.rect.and_then(|r| fraction(r, window)) {
            state["field"] = json!(rect);
        }
        if let Some(caret) = field.caret.and_then(|r| fraction(r, window)) {
            state["caret"] = json!(caret);
        }
    }
    let signature = format!("{}|{}", focused.identity, field.map_or("none", |f| f.kind));
    let mut seen = seen.lock();
    if seen.identity != signature {
        seen.identity = signature;
        seen.serial += 1;
        seen.unchanged = false;
    }
    state["serial"] = json!(seen.serial);
    seen.latest = Some(state.clone());
    state["fields"] = Value::Array(seen.fields.clone());
    state
}

/// Maps the window's text fields again when it may have changed: slow on busy
/// windows, so only from the reader thread, and at most every 750 ms.
pub(super) fn scan(seen: &Mutex<Seen>, backend: &'static dyn Backend, window: &Geometry) {
    let rescan = {
        let mut seen = seen.lock();
        let due = seen.scanned.is_none()
            || (!seen.unchanged && seen.scanned.is_some_and(|at| at.elapsed() >= RESCAN));
        if !due {
            return;
        }
        seen.unchanged = true;
        seen.rescan
    };
    let fields = backend
        .fields(window)
        .into_iter()
        .take(48)
        .filter_map(|field| {
            let mut entry = fraction(field.rect?, window)?.map(|v| json!(v)).to_vec();
            entry.push(json!(field.kind));
            Some(Value::Array(entry))
        })
        .collect();
    let mut seen = seen.lock();
    if seen.rescan != rescan {
        return;
    }
    seen.fields = fields;
    seen.scanned = Some(Instant::now());
}
