//! Mid-batch revocation stops the real dispatch loop before its next effect.
use super::tests_fake::capture;
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
#[test]
fn revocation_inside_a_repeat_stops_all_later_actions() {
    let (backend, capture) = capture();
    let revoked = AtomicBool::new(false);
    let check = || {
        if backend.inputs.lock().len() >= 3 {
            revoked.store(true, Ordering::SeqCst);
        }
        (!revoked.load(Ordering::SeqCst))
            .then_some(())
            .ok_or("revoked".into())
    };
    let batch =
        json!({"kind":"keys","actions":[{"key":"left","repeat":200},{"text":"must not arrive"}]});
    assert!(capture.input_checked(&batch, &check).is_err());
    assert!(revoked.load(Ordering::SeqCst));
    assert_eq!(backend.inputs.lock().len(), 3, "no new effect after revoke");
    assert!(capture
        .input_checked(&json!({"kind":"text","text":"denied"}), &check)
        .is_err());
    assert_eq!(backend.inputs.lock().len(), 3);
    capture.stop();
}
#[test]
fn denied_mouse_or_text_emits_nothing() {
    let (backend, capture) = capture();
    for event in [
        json!({"kind":"click","x":0.2,"y":0.2}),
        json!({"kind":"scroll","x":0.2,"y":0.2,"delta":200}),
        json!({"kind":"text","text":"private"}),
    ] {
        assert!(capture
            .input_checked(&event, &|| Err("revoked".into()))
            .is_err());
    }
    assert!(backend.inputs.lock().is_empty());
    capture.stop();
}
