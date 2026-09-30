use super::*;

#[test]
fn a_logged_in_reply_yields_the_account_and_nothing_else() {
    assert_eq!(
        parse_whoami("Logged in as ellis@example.com 👋\n").as_deref(),
        Some("ellis@example.com")
    );
    assert_eq!(
        parse_whoami("Unauthorized. Please login with `railway login`\n"),
        None
    );
    assert_eq!(parse_whoami(""), None);
    assert_eq!(
        parse_whoami("Logged in as Ellis (one@example.com) 👋"),
        Some("Ellis (one@example.com)".into())
    );
}

#[test]
fn a_command_past_its_deadline_is_killed_and_reported_as_nothing() {
    let started = Instant::now();
    let out = run(
        Command::new("/bin/sleep").arg("5"),
        Duration::from_millis(200),
    );
    assert_eq!(out, None);
    assert!(started.elapsed() < Duration::from_secs(3));
}

#[test]
fn a_checker_that_has_not_answered_yet_says_nothing_at_all() {
    // Under a test this is also the checker a backend gets, so no phone
    // connection made by a test ever runs the CLI.
    assert_eq!(RailwayCli::start().status(), Value::Null);
}

#[test]
fn a_program_on_path_is_found_without_a_shell() {
    let found = on_path("sh").expect("sh is on every test machine's PATH");
    assert!(found.is_absolute() && is_executable(&found));
    assert_eq!(on_path("vibyra-no-such-program-anywhere"), None);
}

/// A command that exits while something it started still holds its stdout
/// must neither hold the caller past the deadline nor leave that process behind.
#[cfg(target_os = "macos")]
#[test]
fn what_a_command_leaves_running_is_killed_with_it() {
    let dir = tempfile::tempdir().unwrap();
    let pid_file = dir.path().join("pid");
    let script = format!("sleep 30 & echo $! > '{}'; exit 0", pid_file.display());
    let started = Instant::now();
    let out = run(
        Command::new("/bin/sh").args(["-c", &script]),
        Duration::from_millis(300),
    );
    assert_eq!(out, None);
    assert!(started.elapsed() < Duration::from_secs(3));
    let pid: libc::pid_t = std::fs::read_to_string(&pid_file)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    let deadline = Instant::now() + Duration::from_secs(2);
    // SAFETY: signal 0 only checks whether the process still exists.
    while unsafe { libc::kill(pid, 0) } == 0 && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    assert_ne!(
        unsafe { libc::kill(pid, 0) },
        0,
        "the background sleep survived"
    );
}
