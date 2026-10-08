use super::*;
use std::time::Duration;

fn wait(runs: &TestRuns, key: &str, root: &Path) -> TestState {
    for _ in 0..200 {
        let state = runs.state(key, root);
        if state.status != TestStatus::Running {
            return state;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("the run never finished");
}

#[cfg(unix)]
fn node_project(script: &str) -> tempfile::TempDir {
    // npm echoes the script line itself, so scripts print counts via printf
    // formats that do not look like counts until they run.
    let dir = tempfile::tempdir().unwrap();
    let manifest = serde_json::json!({ "scripts": { "test": script } });
    std::fs::write(dir.path().join("package.json"), manifest.to_string()).unwrap();
    dir
}

#[cfg(unix)]
fn npm_available() -> bool {
    std::process::Command::new("npm")
        .arg("--version")
        .output()
        .is_ok()
}

#[cfg(unix)]
#[test]
fn a_passing_script_is_a_pass_with_its_raw_output() {
    if !npm_available() {
        return;
    }
    let dir = node_project("printf '%s passed\\n' 3");
    let runs = TestRuns::default();
    let (started, _) = runs.start("p", dir.path()).unwrap();
    assert_eq!(started.status, TestStatus::Running);
    let done = wait(&runs, "p", dir.path());
    assert_eq!(done.status, TestStatus::Passed);
    assert_eq!(done.exit_code, Some(0));
    assert_eq!(done.counts.passed, Some(3));
    assert!(done.lines.iter().any(|l| l.contains("3 passed")));
}

#[cfg(unix)]
#[test]
fn a_failing_script_is_a_fail_and_a_second_run_waits_for_the_first() {
    if !npm_available() {
        return;
    }
    let dir = node_project("sleep 1; printf '%s failed\\n' 1; exit 3");
    let runs = TestRuns::default();
    runs.start("p", dir.path()).unwrap();
    assert!(runs.start("p", dir.path()).is_err(), "one run per project");
    let done = wait(&runs, "p", dir.path());
    assert_eq!((done.status, done.exit_code), (TestStatus::Failed, Some(3)));
    assert_eq!(done.counts.failed, Some(1));
    assert!(
        runs.start("p", dir.path()).is_ok(),
        "a finished run can be repeated"
    );
}

#[cfg(unix)]
#[test]
fn cancel_ends_the_whole_process_group() {
    if !npm_available() {
        return;
    }
    let dir = node_project("echo started; sleep 30");
    let runs = TestRuns::default();
    runs.start("p", dir.path()).unwrap();
    std::thread::sleep(Duration::from_millis(600));
    runs.cancel("p", dir.path());
    let began = Instant::now();
    let done = wait(&runs, "p", dir.path());
    assert_eq!(done.status, TestStatus::Cancelled);
    assert!(began.elapsed() < Duration::from_secs(10));
}

#[test]
fn no_test_script_means_nothing_to_start() {
    let dir = tempfile::tempdir().unwrap();
    let runs = TestRuns::default();
    assert!(runs.start("p", dir.path()).is_err());
    let state = runs.state("p", dir.path());
    assert_eq!((state.status, state.command), (TestStatus::Idle, None));
}

#[test]
fn colour_codes_are_removed_from_lines() {
    assert_eq!(plain("\u{1b}[32mok\u{1b}[0m done"), "ok done");
}
