use std::thread::sleep;
use std::time::Duration;

use super::{pending_prompt, ProcessOutput, SETTLE};

/// Verbatim from `claude auth login --claudeai` over a pipe: the sign-in link
/// and then the question the whole flow hangs on.
const CLAUDE_LOGIN: &str = "Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true\nPaste code here if prompted > ";

fn settled(text: &str) -> ProcessOutput {
    let mut output = ProcessOutput::default();
    output.push(text);
    sleep(SETTLE + Duration::from_millis(60));
    output
}

#[test]
fn recognises_the_question_a_pasted_code_login_ends_on() {
    assert_eq!(
        pending_prompt(CLAUDE_LOGIN),
        Some("Paste code here if prompted >")
    );
    assert_eq!(
        pending_prompt("Do you want to continue? [Y/n]: "),
        Some("Do you want to continue? [Y/n]:")
    );
}

#[test]
fn a_line_introducing_a_link_is_not_a_question() {
    assert_eq!(
        pending_prompt("If the browser didn't open, visit: https://auth.example.test/x"),
        None
    );
    assert_eq!(pending_prompt("Opening browser to sign in…"), None);
    assert_eq!(pending_prompt(""), None);
}

#[test]
fn a_question_stays_open_until_it_is_answered() {
    let mut output = settled(CLAUDE_LOGIN);
    assert_eq!(output.prompt(), "Paste code here if prompted >");

    output.mark_answered();
    assert_eq!(output.prompt(), "");
}

#[test]
fn a_question_only_counts_once_the_cli_stops_typing() {
    let mut output = ProcessOutput::default();
    output.push("If the browser didn't open, visit:");
    assert_eq!(output.prompt(), "", "still mid-line");
    output.push(" https://auth.example.test/x\n");
    sleep(SETTLE + Duration::from_millis(60));
    assert_eq!(output.prompt(), "");
}

/// npm signs off with the path to its debug log. Quoting that back says
/// nothing about what went wrong three lines earlier.
#[test]
fn a_failure_is_quoted_from_the_line_that_explains_it() {
    let output = settled(
        "npm warn deprecated thing@1.0.0\n\
         npm error code EACCES\n\
         npm error syscall mkdir\n\
         npm error A complete log of this run can be found in: /tmp/x-debug-0.log\n",
    );
    assert_eq!(output.failure_line(), "npm error code EACCES");
}

#[test]
fn output_with_nothing_to_blame_falls_back_to_the_last_thing_said() {
    let output = settled("Signing in\nGave up waiting\n\n");
    assert_eq!(output.failure_line(), "Gave up waiting");
}
