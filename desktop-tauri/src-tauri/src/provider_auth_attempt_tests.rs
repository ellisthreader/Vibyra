use std::time::{Duration, Instant};

use super::{settled_without_connection, AttemptState, LoginAttemptStore, SUCCESS_SETTLE_WINDOW};

#[test]
fn successful_login_exit_has_a_bounded_settle_window() {
    let now = Instant::now();
    assert!(!settled_without_connection(Some(now), now));
    assert!(settled_without_connection(
        Some(now),
        now + SUCCESS_SETTLE_WINDOW + Duration::from_millis(1)
    ));
}

#[test]
fn typing_at_a_login_nobody_started_is_refused() {
    let store = LoginAttemptStore::default();
    assert!(store.submit("claude", "code").is_err());
    assert_eq!(store.view("claude").state, AttemptState::None);
}

#[cfg(unix)]
mod children {
    use std::process::{Command, Stdio};
    use std::sync::Arc;
    use std::thread::sleep;
    use std::time::Duration;

    use parking_lot::Mutex;

    use super::{AttemptState, LoginAttemptStore};
    use crate::provider_auth_output::{capture, ProcessOutput};

    type Output = Arc<Mutex<ProcessOutput>>;

    fn start(store: &LoginAttemptStore, id: &str, installing: bool, script: &str) -> Output {
        let mut child = Command::new("sh")
            .args(["-c", script])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let output: Output = Arc::default();
        capture(child.stdout.take().unwrap(), Arc::clone(&output));
        store.start(id, installing, child, Arc::clone(&output));
        output
    }

    /// The whole point of the reply box: a CLI that stops on "paste the code"
    /// has to be able to receive one.
    #[test]
    fn a_reply_reaches_the_cli_and_closes_the_question() {
        let store = LoginAttemptStore::default();
        let output = start(
            &store,
            "claude",
            false,
            "printf 'Paste code here if prompted > '; read reply; printf 'signed in as %s\\n' \"$reply\"",
        );
        sleep(Duration::from_millis(700));
        assert_eq!(store.view("claude").prompt, "Paste code here if prompted >");

        store.submit("claude", "test-code").unwrap();
        sleep(Duration::from_millis(500));
        // A prompt has no trailing newline, so the CLI's answer lands on the
        // same line the question was asked on — as it does in a real terminal.
        assert!(output
            .lock()
            .failure_line()
            .ends_with("signed in as test-code"));
        assert_eq!(store.view("claude").prompt, "");
    }

    #[test]
    fn a_finished_install_is_cleared_and_a_failed_one_is_kept_to_explain() {
        let store = LoginAttemptStore::default();
        start(&store, "codex", true, "exit 0");
        start(
            &store,
            "gemini",
            true,
            "echo 'npm error 404 Not Found'; exit 1",
        );
        sleep(Duration::from_millis(400));

        assert!(store.take_finished_install());
        assert_eq!(store.view("codex").state, AttemptState::None);

        let failed = store.view("gemini");
        assert_eq!(failed.state, AttemptState::Failed);
        assert!(failed.installing);
        assert_eq!(failed.failure_line, "npm error 404 Not Found");
    }
}
