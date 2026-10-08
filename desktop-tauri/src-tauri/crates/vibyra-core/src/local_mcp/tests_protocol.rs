//! Both protocol eras and the shapes of what comes back.

use super::tests_support::*;
use super::*;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

fn sup() -> Arc<Supervisor> {
    supervisor(quick(), Arc::default())
}

fn echo(sup: &Supervisor, spec: &ServerSpec, value: &str) -> CallResult {
    sup.call_tool(spec, "echo", &json!({"text": value}))
        .unwrap()
}

#[test]
fn a_dual_era_server_is_spoken_to_in_the_modern_style_and_paging_is_followed() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("modern", ""));
    let tools = sup.list_tools(&spec).unwrap();
    assert_eq!(tools.len(), 10, "both pages");
    assert!(
        tools
            .iter()
            .find(|t| t.name == "echo")
            .unwrap()
            .read_only_hint
    );
    assert!(
        !tools
            .iter()
            .find(|t| t.name == "write_note")
            .unwrap()
            .read_only_hint
    );
    assert_eq!(sup.status(&spec.id).era.as_deref(), Some("modern"));
    assert_eq!(
        sup.status(&spec.id).protocol_version.as_deref(),
        Some("2026-07-28")
    );
    assert_eq!(text(&echo(&sup, &spec, "hi")), "hi");
}

#[test]
fn a_legacy_server_that_rejects_discover_gets_the_initialize_handshake() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("legacy", "legacy-only"));
    assert_eq!(text(&echo(&sup, &spec, "old")), "old");
    let status = sup.status(&spec.id);
    assert_eq!(status.era.as_deref(), Some("legacy"));
    assert_eq!(status.protocol_version.as_deref(), Some("2025-11-25"));
}

#[test]
fn a_server_that_never_answers_discover_is_tried_with_initialize_after_the_probe() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("silent", "silent-discover"));
    let started = std::time::Instant::now();
    assert_eq!(text(&echo(&sup, &spec, "late")), "late");
    assert!(
        started.elapsed() >= Duration::from_millis(400),
        "waited out the probe"
    );
    assert_eq!(sup.status(&spec.id).era.as_deref(), Some("legacy"));
}

#[test]
fn a_modern_only_server_works() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("modernonly", "modern-only"));
    assert_eq!(text(&echo(&sup, &spec, "new")), "new");
    assert_eq!(sup.status(&spec.id).era.as_deref(), Some("modern"));
}

#[test]
fn tool_level_errors_and_requests_for_input_are_reported_not_fatal() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("errors", ""));
    let failed = sup.call_tool(&spec, "fail", &json!({})).unwrap();
    assert!(failed.is_error);
    assert_eq!(failed.text, "it went wrong");
    let asked = sup.call_tool(&spec, "ask", &json!({})).unwrap_err();
    assert_eq!(asked.reason(), "unsupported");
    let unknown = sup.call_tool(&spec, "nope", &json!({})).unwrap_err();
    assert_eq!(unknown.reason(), "rpc_error");
    assert_eq!(
        sup.status(&spec.id).state,
        State::Running,
        "none of these stops the server"
    );
}

#[test]
fn a_banner_on_stdout_is_ignored_and_a_big_result_is_clipped() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("noise", "noise"));
    assert_eq!(text(&echo(&sup, &spec, "ok")), "ok");
    let big = sup
        .call_tool(&spec, "big", &json!({"bytes": 50_000}))
        .unwrap();
    assert_eq!(big.text.len(), RESULT_TEXT_BYTES);
    assert!(big.truncated);
}

#[test]
fn a_server_that_only_prints_text_fails_with_what_it_printed() {
    if !node_available() {
        return;
    }
    let limits = Limits {
        start_timeout: Duration::from_millis(900),
        ..quick()
    };
    let (sup, spec) = (
        supervisor(limits, Arc::default()),
        spec("onlynoise", "noise,slow-start=5000"),
    );
    let error = sup.list_tools(&spec).unwrap_err();
    assert_eq!(error.reason(), "unavailable");
    assert!(
        error.to_string().contains("Welcome to the noisy server"),
        "{error}"
    );
}

#[test]
fn an_oversized_message_fails_the_call_without_buffering_it_and_the_server_restarts() {
    if !node_available() {
        return;
    }
    let limits = Limits {
        max_message: 100_000,
        ..quick()
    };
    let (sup, spec) = (supervisor(limits, Arc::default()), spec("oversized", ""));
    let error = sup
        .call_tool(&spec, "big", &json!({"bytes": 600_000}))
        .unwrap_err();
    assert_eq!(error.reason(), "too_large", "{error}");
    std::thread::sleep(Duration::from_millis(250));
    assert_eq!(text(&echo(&sup, &spec, "again")), "again");
}

#[test]
fn a_legacy_server_that_exits_on_discover_gets_one_clean_initialize() {
    if !node_available() {
        return;
    }
    let (sup, spec) = (sup(), spec("exitprobe", "exit-on-discover"));
    assert_eq!(text(&echo(&sup, &spec, "restarted")), "restarted");
    assert_eq!(sup.status(&spec.id).era.as_deref(), Some("legacy"));
}
