use super::*;

fn run(error: &str, logs: &[&str]) -> Diagnosis {
    diagnose(
        error,
        &logs
            .iter()
            .map(|line| (*line).to_owned())
            .collect::<Vec<_>>(),
    )
}

#[test]
fn classifies_the_common_first_run_failures() {
    let code = |error: &str, logs: &[&str]| run(error, logs).code;
    assert_eq!(
        code(
            "npm exited with exit status: 127",
            &["sh: vite: command not found"]
        ),
        PreviewErrorCode::MissingDependencies
    );
    assert_eq!(
        code(
            "could not start pnpm: No such file or directory (os error 2)",
            &[]
        ),
        PreviewErrorCode::ToolNotFound
    );
    assert_eq!(
        code(
            "npm exited",
            &["Error: listen EADDRINUSE: address already in use :::3000"]
        ),
        PreviewErrorCode::PortInUse
    );
    assert_eq!(
        code(
            "Installing dependencies failed (npm exited with exit status: 1)",
            &[]
        ),
        PreviewErrorCode::InstallFailed
    );
    assert_eq!(
        code("Preview did not become ready: nothing opened its port", &[]),
        PreviewErrorCode::Timeout
    );
    assert_eq!(
        code(
            "npm exited",
            &["CommandError: react-native-web is required"]
        ),
        PreviewErrorCode::MissingWebSupport
    );
    assert_eq!(
        code("npm exited", &["error vite@7 requires Node.js 20.19+"]),
        PreviewErrorCode::NodeVersion
    );
    assert_eq!(
        code("npm exited with exit status: 1", &["something else"]),
        PreviewErrorCode::Exited
    );
}

#[test]
fn says_it_in_plain_words_and_names_the_missing_tool() {
    let found = run(
        "could not start pnpm: No such file or directory (os error 2)",
        &[],
    );
    assert_eq!(found.summary, "Vibyra couldn’t find pnpm on this Mac");
    assert!(found.hint.contains("restart Vibyra"));
    for words in [&found.summary, &found.hint] {
        assert!(
            !words.contains("exit status") && !words.contains("os error"),
            "{words}"
        );
    }
}

#[test]
fn quotes_the_line_that_says_why_without_log_decoration() {
    let found = run(
        "npm exited with exit status: 1",
        &[
            "$ npm run dev",
            "[Vite] ready",
            "[Vite error] Error: Cannot find module 'left-pad'",
        ],
    );
    assert_eq!(
        found.cause.as_deref(),
        Some("Error: Cannot find module 'left-pad'")
    );
    assert!(run("x", &["$ npm run dev"]).cause.is_none());
}
