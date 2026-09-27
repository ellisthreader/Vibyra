use super::*;

#[test]
fn the_install_is_global_and_never_touches_the_current_project() {
    let args = arguments("@github/copilot");
    assert!(args.contains(&"--global".to_string()));
    assert!(args.contains(&"@github/copilot".to_string()));
    assert!(!args.iter().any(|arg| arg == "--save" || arg == "-D"));
}

#[test]
fn a_failure_reports_npms_own_words_when_it_has_any() {
    let stderr = b"npm notice something chatty\nnpm error 404 Not Found - GET https://registry\n";
    let message = failure(stderr, "@github/copilot");
    assert!(message.contains("404"), "{message}");
    assert!(!message.contains("npm notice"), "chatter leaked: {message}");
}

#[test]
fn a_silent_failure_still_names_the_command_to_try() {
    let message = failure(b"", "@charmland/crush");
    assert!(
        message.contains("npm install --global @charmland/crush"),
        "{message}"
    );
}

#[test]
fn a_very_loud_failure_is_cut_to_something_readable() {
    let stderr = "npm error ".to_string() + &"x".repeat(5_000);
    assert!(failure(stderr.as_bytes(), "x").chars().count() <= 200);
}
