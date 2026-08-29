//! Supervisor tests against a fake CLI.
//!
//! A shell script stands in for the provider so these run on a machine with no
//! account, no network and no credits — the behaviour under test is Vibyra's
//! (does it stream, does it stop, does it leave anything running), not the
//! model's. The real CLIs are covered by the fixture tests next door and by
//! the live journeys, which no unit test can replace.

use super::process::{run, TurnCommand, TurnExit, TurnHandle};

#[cfg(unix)]
fn fake(script: &str, prompt: &str) -> TurnCommand {
    TurnCommand {
        program: "/bin/sh".into(),
        args: vec!["-c".into(), script.into()],
        cwd: "/tmp".into(),
        env: Vec::new(),
        env_remove: Vec::new(),
        prompt: prompt.into(),
    }
}

#[cfg(unix)]
#[test]
fn streams_every_line_then_completes() {
    let handle = TurnHandle::new();
    let mut seen = Vec::new();
    let exit = run(fake("printf 'one\\ntwo\\nthree\\n'", ""), &handle, |line| {
        seen.push(line.to_string())
    })
    .unwrap();

    assert_eq!(exit, TurnExit::Completed);
    assert_eq!(seen, ["one", "two", "three"]);
}

/// The prompt travels on stdin, never as an argument, and closing stdin is
/// what tells both real CLIs the prompt is finished.
#[cfg(unix)]
#[test]
fn the_prompt_arrives_on_stdin_and_the_pipe_is_closed() {
    let handle = TurnHandle::new();
    let mut seen = Vec::new();
    let exit = run(fake("cat", "--not-a-flag\nsecond line"), &handle, |line| {
        seen.push(line.to_string())
    })
    .unwrap();

    assert_eq!(
        exit,
        TurnExit::Completed,
        "cat only exits when stdin closes"
    );
    assert_eq!(seen, ["--not-a-flag", "second line"]);
}

/// A provider that fails is a transcript event carrying its own words, not an
/// exception the UI has to invent a message for.
#[cfg(unix)]
#[test]
fn a_failing_process_reports_its_stderr() {
    let handle = TurnHandle::new();
    let exit = run(
        fake(
            "echo 'No conversation found with session ID' >&2; exit 1",
            "",
        ),
        &handle,
        |_| {},
    )
    .unwrap();

    match exit {
        TurnExit::Failed(detail) => assert!(detail.contains("No conversation found"), "{detail}"),
        other => panic!("expected a failure, got {other:?}"),
    }
}

/// The one that matters: a provider CLI spawns a shell which spawns work.
/// Killing only the child leaves the grandchild running and holding the pipe.
#[cfg(unix)]
#[test]
fn cancelling_kills_the_whole_process_tree() {
    let tmp = tempfile::tempdir().unwrap();
    let marker = tmp.path().join("grandchild-survived");
    let handle = TurnHandle::new();
    let stopper = handle.clone();

    // A grandchild that would touch the marker a second from now, and a child
    // that reports it is running and then waits.
    let script = format!(
        "( sleep 1; touch {} ) & echo running; wait",
        marker.display()
    );

    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(150));
        stopper.cancel();
    });
    let exit = run(fake(&script, ""), &handle, |_| {}).unwrap();

    assert_eq!(exit, TurnExit::Cancelled);
    std::thread::sleep(std::time::Duration::from_millis(1_400));
    assert!(
        !marker.exists(),
        "the grandchild outlived the turn — the process group was not signalled"
    );
}

/// Cancelling before the process exists must still stop it. The pid is only
/// knowable after the spawn, so the flag has to be re-checked there.
#[cfg(unix)]
#[test]
fn a_turn_cancelled_before_it_starts_does_not_run_away() {
    let handle = TurnHandle::new();
    handle.cancel();
    let exit = run(fake("sleep 30; echo late", ""), &handle, |_| {}).unwrap();
    assert_eq!(exit, TurnExit::Cancelled);
}

/// A CLI that never emits a newline must cost a bounded amount of memory, not
/// everything the machine has.
#[cfg(unix)]
#[test]
fn an_unterminated_runaway_line_is_bounded() {
    let handle = TurnHandle::new();
    let mut widest = 0usize;
    let exit = run(
        // 8 MB with no newline at all, against a 4 MB line cap.
        fake(
            "yes ................................................ | head -c 8388608",
            "",
        ),
        &handle,
        |line| widest = widest.max(line.len()),
    )
    .unwrap();

    assert_eq!(exit, TurnExit::Completed);
    assert!(widest <= 4 * 1024 * 1024, "line grew to {widest} bytes");
}

/// A command that does not exist is a sentence the user can act on, not an
/// operating-system error code.
#[test]
fn a_missing_program_explains_itself() {
    let handle = TurnHandle::new();
    let error = run(
        TurnCommand {
            program: "vibyra-no-such-cli".into(),
            args: Vec::new(),
            cwd: std::env::temp_dir().to_string_lossy().into_owned(),
            env: Vec::new(),
            env_remove: Vec::new(),
            prompt: String::new(),
        },
        &handle,
        |_| {},
    )
    .unwrap_err()
    .to_string();

    assert!(error.contains("vibyra-no-such-cli"), "{error}");
    assert!(error.contains("on PATH"), "{error}");
}
