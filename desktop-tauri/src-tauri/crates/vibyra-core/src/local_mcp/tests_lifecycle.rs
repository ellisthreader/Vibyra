//! Start on demand, stop when idle, restart after a crash, time limits.

use super::tests_support::*;
use super::*;
use serde_json::json;
use std::sync::Arc;
use std::time::Duration;

fn pid(sup: &Supervisor, spec: &ServerSpec) -> i32 {
    text(&sup.call_tool(spec, "pid", &json!({})).unwrap())
        .parse()
        .unwrap()
}

#[path = "idle_fixture.rs"]
mod idle_fixture;

#[test]
fn a_server_starts_on_first_use_and_there_is_one_process_per_server() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let (a, b) = (spec("one", ""), spec("two", ""));
    assert_eq!(
        sup.status(&a.id).state,
        State::Stopped,
        "nothing runs until it is used"
    );
    let first = pid(&sup, &a);
    assert_eq!(sup.status(&a.id).state, State::Running);
    assert_eq!(pid(&sup, &a), first);
    assert_ne!(pid(&sup, &b), first, "another server is another process");
    let threads: Vec<_> = (0..4)
        .map(|_| {
            let (sup, a) = (sup.clone(), a.clone());
            std::thread::spawn(move || pid(&sup, &a))
        })
        .collect();
    for thread in threads {
        assert_eq!(
            thread.join().unwrap(),
            first,
            "concurrent calls share the process"
        );
    }
}

#[test]
fn a_crash_is_reported_then_the_server_restarts_after_the_backoff() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let spec = spec("crash", "");
    let before = pid(&sup, &spec);
    let crashed = sup.call_tool(&spec, "crash", &json!({})).unwrap_err();
    assert_eq!(crashed.reason(), "crashed");
    assert_eq!(sup.status(&spec.id).failures, 1);
    let soon = sup.call_tool(&spec, "pid", &json!({})).unwrap_err();
    assert!(
        matches!(
            soon,
            McpError::Unavailable {
                retry_after: Some(_),
                ..
            }
        ),
        "{soon:?}"
    );
    std::thread::sleep(Duration::from_millis(250));
    let after = pid(&sup, &spec);
    assert_ne!(after, before);
    assert_eq!(
        sup.status(&spec.id).failures,
        0,
        "a good call resets the count"
    );
}

#[test]
fn a_call_that_outlives_its_limit_times_out_and_the_server_is_stopped() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let mut spec = spec("hang", "");
    spec.timeout_secs = Some(1);
    let before = pid(&sup, &spec);
    let started = std::time::Instant::now();
    let error = sup.call_tool(&spec, "hang", &json!({})).unwrap_err();
    assert_eq!(error.reason(), "timeout");
    assert!(started.elapsed() < Duration::from_secs(4));
    assert!(
        gone_within(before, Duration::from_secs(3)),
        "a hung server is stopped, not left running"
    );
}

#[test]
fn call_time_limits_are_clamped_to_one_second_and_five_minutes() {
    let limits = Limits::default();
    assert_eq!(limits.call_timeout(None), Duration::from_secs(60));
    assert_eq!(limits.call_timeout(Some(0)), Duration::from_secs(1));
    assert_eq!(limits.call_timeout(Some(99_999)), Duration::from_secs(300));
}

#[test]
fn a_slow_starting_server_is_waited_for_but_not_forever() {
    if !node_available() {
        return;
    }
    let slow = spec("slow", "slow-start=1200");
    let patient = supervisor(quick(), Arc::default());
    let started = std::time::Instant::now();
    assert_eq!(patient.list_tools(&slow).unwrap().len(), 10);
    assert!(started.elapsed() >= Duration::from_millis(1200));
    let limits = Limits {
        start_timeout: Duration::from_millis(600),
        ..quick()
    };
    let impatient = supervisor(limits, Arc::default());
    let error = impatient
        .list_tools(&spec("slow2", "slow-start=3000"))
        .unwrap_err();
    assert!(
        error.to_string().contains("did not finish starting"),
        "{error}"
    );
}

#[test]
fn repeated_failures_leave_the_server_failed_until_retry() {
    if !node_available() {
        return;
    }
    let limits = Limits {
        restart_backoff: vec![Duration::from_millis(10)],
        ..quick()
    };
    let sup = supervisor(limits, Arc::default());
    let spec = spec("dies", "die-on-start");
    for _ in 0..3 {
        std::thread::sleep(Duration::from_millis(30));
        assert!(sup.list_tools(&spec).is_err());
    }
    assert_eq!(sup.status(&spec.id).state, State::Failed);
    let stuck = sup.list_tools(&spec).unwrap_err();
    assert!(
        matches!(
            stuck,
            McpError::Unavailable {
                retry_after: None,
                ..
            }
        ),
        "{stuck:?}"
    );
    sup.retry(&spec.id);
    assert_eq!(sup.status(&spec.id).state, State::Stopped);
}

#[test]
fn a_disabled_server_is_never_started_and_an_edit_restarts_it() {
    if !node_available() {
        return;
    }
    let sup = supervisor(quick(), Arc::default());
    let mut spec = spec("edit", "");
    spec.enabled = false;
    assert_eq!(sup.list_tools(&spec).unwrap_err().reason(), "disabled");
    spec.enabled = true;
    let first = pid(&sup, &spec);
    spec.env.insert("EXTRA".into(), "1".into());
    assert_ne!(
        pid(&sup, &spec),
        first,
        "a changed launch means a new process"
    );
}
