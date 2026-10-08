//! Keyboard focus on Windows and Linux, against the fake backend: the JSON
//! the phone reads, focus after a tap, and frames that never wait on the app.

use super::fields::kind;
use super::focus::Focused;
use super::tests_fake::{capture, eventually, field};
use serde_json::json;
use std::time::{Duration, Instant};

#[test]
fn focus_reports_the_field_as_window_fractions_and_moves_its_serial() {
    let (backend, capture) = capture();
    let quiet = eventually(&capture, |state| state["serial"].as_u64() > Some(0));
    assert_eq!(quiet["editable"], false);
    assert_eq!(quiet["v"], 1);
    *backend.focused.lock() = Focused {
        front: true,
        identity: "email".into(),
        field: Some(field("email", [150.0, 110.0, 300.0, 30.0])),
    };
    let typing = eventually(&capture, |state| state["editable"] == true);
    assert_eq!(
        (
            typing["editable"].clone(),
            typing["kind"].clone(),
            typing["front"].clone()
        ),
        (json!(true), json!("email"), json!(true))
    );
    assert_eq!(typing["field"], json!([0.0625, 0.1, 0.375, 0.05]));
    assert_eq!(typing["label"], "Email address");
    assert!(typing["serial"].as_u64() > quiet["serial"].as_u64());
    assert_eq!(
        capture.focus().unwrap()["serial"],
        typing["serial"],
        "stable while focus stays"
    );
    // The field map arrives from the background reader.
    let fields = eventually(&capture, |state| {
        state["fields"]
            .as_array()
            .is_some_and(|list| !list.is_empty())
    })["fields"]
        .clone();
    assert_eq!(
        fields,
        json!([
            [0.0625, 0.1, 0.375, 0.05, "email"],
            [0.0625, 0.1833, 0.375, 0.05, "secure"],
            [0.9375, 0.9167, 0.0625, 0.05, "text"]
        ])
    );
    capture.stop();
}

#[test]
fn a_tap_replies_once_focus_has_moved() {
    let (backend, capture) = capture();
    let initial = eventually(&capture, |state| state["serial"].as_u64() > Some(0));
    let before = initial["serial"].as_u64().unwrap();
    *backend.click_focuses.lock() = Some(Focused {
        front: true,
        identity: "pass".into(),
        field: Some(field("secure", [150.0, 160.0, 300.0, 30.0])),
    });
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.2,"y":0.2}))
        .unwrap();
    let elapsed = started.elapsed();
    super::tests_focus_budget::assert_changed_or_expired(&reply, &initial, elapsed);
    let observed = eventually(&capture, |state| state["editable"] == true);
    assert_eq!(observed["kind"], "secure", "{observed}");
    assert!(observed["serial"].as_u64().unwrap() > before);
    assert_eq!(backend.inputs.lock().len(), 1);
    assert!(
        elapsed < Duration::from_millis(400),
        "changed focus: {elapsed:?}"
    );
    // A tap that moves nothing still answers promptly.
    let started = Instant::now();
    assert_eq!(
        capture
            .input(&json!({"kind":"click","x":0.9,"y":0.9}))
            .unwrap()["kind"],
        "secure"
    );
    let elapsed = started.elapsed();
    assert!(
        elapsed < Duration::from_millis(400),
        "unchanged focus: {elapsed:?}"
    );
    capture.stop();
}

#[test]
fn unchanged_focus_reads_do_not_extend_the_tap_wait() {
    let (backend, capture) = capture();
    eventually(&capture, |state| state["serial"].as_u64() > Some(0));
    // Polling a responsive but slower application still shares one wait budget.
    *backend.stall.lock() = Duration::from_millis(35);
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.9,"y":0.9}))
        .unwrap();
    assert_eq!(reply["editable"], false);
    let elapsed = started.elapsed();
    *backend.stall.lock() = Duration::ZERO;
    capture.stop();
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
}

#[test]
fn input_injection_and_focus_settling_share_one_tap_budget() {
    let (backend, capture) = capture();
    eventually(&capture, |state| state["serial"].as_u64() > Some(0));
    *backend.input_stall.lock() = Duration::from_millis(240);
    let started = Instant::now();
    let reply = capture
        .input(&json!({"kind":"click","x":0.9,"y":0.9}))
        .unwrap();
    let elapsed = started.elapsed();
    capture.stop();
    assert_eq!(reply["editable"], false);
    assert_eq!(backend.inputs.lock().len(), 1, "input is still delivered");
    assert!(elapsed < Duration::from_millis(400), "{elapsed:?}");
}

#[test]
fn structure_decides_the_keyboard_before_wording() {
    assert_eq!(kind(true, false, false, "email"), "secure");
    assert_eq!(kind(false, true, false, "Email the team"), "multiline");
    assert_eq!(kind(false, false, true, "Email"), "search");
    assert_eq!(kind(false, false, false, "Work e-mail"), "email");
    assert_eq!(kind(false, false, false, "Phone"), "tel");
    assert_eq!(kind(false, false, false, "Verification code"), "number");
    assert_eq!(kind(false, false, false, "Website"), "url");
    assert_eq!(kind(false, false, false, "Name"), "text");
}

#[test]
fn a_hung_application_never_holds_back_frames() {
    let (backend, capture) = capture();
    *backend.stall.lock() = Duration::from_millis(1500);
    for _ in 0..5 {
        let started = Instant::now();
        capture.focus().unwrap();
        assert!(
            started.elapsed() < Duration::from_millis(100),
            "{:?}",
            started.elapsed()
        );
        assert!(capture.frame().is_ok());
    }
    *backend.stall.lock() = Duration::ZERO;
    capture.stop();
}
