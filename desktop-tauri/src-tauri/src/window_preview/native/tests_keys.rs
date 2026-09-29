//! Live typing on Windows and Linux: batched keys arrive in order, and a bad
//! batch sends nothing.

use super::input::{InputEvent, Key};
use super::tests_fake::capture;
use serde_json::json;

#[test]
fn a_key_batch_arrives_in_order_with_repeats_expanded() {
    let (backend, capture) = capture();
    let batch = json!({"kind":"keys","actions":[{"text":"hé👍"},{"key":"backspace","repeat":3},{"key":"shiftTab"},{"text":"x"}]});
    capture.input(&batch).unwrap();
    let inputs = backend.inputs.lock().clone();
    assert_eq!(inputs.len(), 6, "{inputs:?}");
    assert_eq!(inputs[0], InputEvent::Text("hé👍".encode_utf16().collect()));
    assert!(inputs[1..4]
        .iter()
        .all(|event| *event == InputEvent::Key(Key::Backspace)));
    assert_eq!(inputs[4], InputEvent::Key(Key::ShiftTab));
    assert_eq!(inputs[5], InputEvent::Text(vec![u16::from(b'x')]));
    capture.stop();
}

#[test]
fn a_bad_batch_sends_nothing() {
    let (backend, capture) = capture();
    let long = "a".repeat(300);
    for bad in [
        json!({"kind":"keys","actions":[]}),
        json!({"kind":"keys","actions":[{"text":"ok"},{"key":"f4"}]}),
        json!({"kind":"keys","actions":[{"text":"ok"},{"key":"a"}]}),
        json!({"kind":"keys","actions":[{"key":"enter","repeat":0}]}),
        json!({"kind":"keys","actions":[{"key":"enter","repeat":201}]}),
        json!({"kind":"keys","actions":[{"text":long},{"text":long}]}),
        json!({"kind":"keys","actions":(0..65).map(|_| json!({"key":"tab"})).collect::<Vec<_>>()}),
    ] {
        assert!(capture.input(&bad).is_err(), "{bad}");
    }
    assert!(
        backend.inputs.lock().is_empty(),
        "no partial batch reached the window"
    );
    capture.stop();
}
