//! F-05 (Mac side): the final answer is cut to the server's limit, a refusal
//! the server will never accept fails the run once (never a silent re-claim
//! loop), fences stop quietly, and failure reasons name nothing local.

use super::*;

#[derive(Default)]
struct Scripted {
    calls: Mutex<Vec<String>>,
    /// One error per `complete` call, in order; `Ok` once they run out.
    complete_errors: Mutex<Vec<ApiError>>,
}

impl Scripted {
    fn failing(errors: Vec<ApiError>) -> Self {
        Self {
            complete_errors: Mutex::new(errors),
            ..Default::default()
        }
    }
    fn log(&self, entry: String) {
        self.calls.lock().unwrap().push(entry);
    }
    fn calls(&self) -> Vec<String> {
        self.calls.lock().unwrap().clone()
    }
}

impl Backend for Scripted {
    fn events(&self, _: &[(&str, String)]) -> Result<(), ApiError> {
        Ok(())
    }
    fn complete(&self, answer: &str) -> Result<(), ApiError> {
        let tail: String = answer
            .chars()
            .rev()
            .take(12)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .collect();
        self.log(format!("complete:{}:{tail}", answer.chars().count()));
        let mut errors = self.complete_errors.lock().unwrap();
        if errors.is_empty() {
            Ok(())
        } else {
            Err(errors.remove(0))
        }
    }
    fn fail(&self, code: &str, reason: &str) -> Result<(), ApiError> {
        self.log(format!("fail:{code}:{reason}"));
        Ok(())
    }
}

fn refused(status: u16, code: &str) -> ApiError {
    ApiError::Refused {
        status,
        code: code.into(),
        message: String::new(),
    }
}

fn run(errors: Vec<ApiError>, answer_chars: usize) -> (Outcome, Vec<String>) {
    let dir = tempfile::tempdir().unwrap();
    let result = format!(
        r#"{{"type":"result","subtype":"success","is_error":false,"result":"{}"}}"#,
        "x".repeat(answer_chars)
    );
    let plan = plan(dir.path(), &[INIT_OK, &result], &[]);
    let backend = Scripted::failing(errors);
    let outcome = execute(&plan, &backend, &Control::default());
    (outcome, backend.calls())
}

#[test]
fn an_oversized_answer_is_cut_to_the_limit_with_a_notice() {
    let (outcome, calls) = run(vec![], 70_000);
    assert_eq!(outcome, Outcome::Completed);
    assert_eq!(calls.len(), 1);
    assert!(calls[0].starts_with("complete:60000:"), "{}", calls[0]);
    assert!(
        calls[0].ends_with("save.]"),
        "the notice closes the answer: {}",
        calls[0]
    );
    assert_eq!(post::clip_answer("short"), "short");
    let exact = "y".repeat(60_000);
    assert_eq!(post::clip_answer(&exact), exact);
}

#[test]
fn a_refusal_the_server_will_never_accept_fails_the_run_once_and_stops() {
    for (status, code) in [
        (422, "invalid_request"),
        (413, "http_error"),
        (409, "actions_open"),
        (400, "http_error"),
    ] {
        let (outcome, calls) = run(vec![refused(status, code)], 30);
        assert_eq!(outcome, Outcome::Failed("runner_error".into()), "{status}");
        assert_eq!(
            calls.len(),
            2,
            "one complete, one fail, nothing more: {calls:?}"
        );
        assert!(calls[1].starts_with("fail:runner_error:"), "{calls:?}");
    }
}

#[test]
fn a_fence_is_a_quiet_stop_not_a_failure() {
    let (outcome, calls) = run(vec![refused(409, "instruction_pending")], 30);
    assert_eq!((outcome, calls.len()), (Outcome::Steered, 1));
    let (outcome, calls) = run(vec![refused(409, "stale_lease")], 30);
    assert_eq!((outcome, calls.len()), (Outcome::Stale, 1));
    let (outcome, calls) = run(vec![refused(409, "run_cancelled")], 30);
    assert_eq!((outcome, calls.len()), (Outcome::Cancelled, 1));
}

#[test]
fn rate_limits_and_server_errors_are_retried_then_left_to_the_lease() {
    let (outcome, calls) = run(
        vec![refused(429, "throttled"), refused(503, "http_error")],
        30,
    );
    assert_eq!((outcome, calls.len()), (Outcome::Completed, 3));
    let down = vec![refused(500, "http_error"); 4];
    let (outcome, calls) = run(down, 30);
    assert!(matches!(outcome, Outcome::Failed(_)));
    assert!(
        calls.iter().all(|c| c.starts_with("complete:")),
        "an outage is not a runner error: {calls:?}"
    );
    let (outcome, _) = run(vec![ApiError::Network("down".into())], 30);
    assert_eq!(outcome, Outcome::Completed, "a lost connection is retried");
}

#[test]
fn a_crash_reports_a_plain_reason_never_the_stderr_tail() {
    let dir = tempfile::tempdir().unwrap();
    let plan = plan(dir.path(), &[INIT_OK], &[]);
    let crashing = FAKE.replace(
        r#"cat "$FAKE_OUT";;"#,
        r#"cat "$FAKE_OUT"; echo "/Users/alice/secret/project: boom" >&2; exit 1;;"#,
    );
    std::fs::write(dir.path().join("claude.sh"), crashing).unwrap();
    let backend = Scripted::default();
    let outcome = execute(&plan, &backend, &Control::default());
    assert_eq!(outcome, Outcome::Failed("provider_error".into()));
    let calls = backend.calls();
    assert_eq!(calls.len(), 1);
    assert!(calls[0].starts_with("fail:provider_error:"), "{calls:?}");
    assert!(
        !calls[0].contains("alice") && !calls[0].contains("/Users"),
        "{calls:?}"
    );
}
