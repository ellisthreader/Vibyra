use super::PromptCapture;

fn first(inputs: &[&[u8]]) -> Option<String> {
    let mut capture = PromptCapture::default();
    for input in inputs {
        capture.feed(input);
    }
    capture.first_prompt().map(str::to_owned)
}

#[test]
fn keeps_the_first_submitted_request() {
    assert_eq!(
        first(&[b"redesign the website hero\r", b"now make it blue\r"]).as_deref(),
        Some("redesign the website hero")
    );
}

#[test]
fn a_line_is_not_a_request_until_it_is_submitted() {
    assert_eq!(first(&[b"redesign the website hero"]), None);
}

#[test]
fn keystrokes_split_across_writes_join_up() {
    assert_eq!(
        first(&[b"fix the ", b"login ", b"bug", b"\r"]).as_deref(),
        Some("fix the login bug")
    );
}

#[test]
fn backspace_and_clear_edit_the_line() {
    assert_eq!(
        first(&[b"fix the logon\x7f\x7fin bug\r"]).as_deref(),
        Some("fix the login bug")
    );
    assert_eq!(
        first(&[b"wrong words here\x15add dark mode\r"]).as_deref(),
        Some("add dark mode")
    );
    assert_eq!(
        first(&[b"never mind this\x03write the tests\r"]).as_deref(),
        Some("write the tests")
    );
}

#[test]
fn backspace_removes_a_whole_multibyte_character() {
    assert_eq!(
        first(&["add café\u{7f}e menu page\r".as_bytes()]).as_deref(),
        Some("add cafe menu page")
    );
}

#[test]
fn answers_and_commands_are_not_requests() {
    assert_eq!(first(&[b"y\r"]), None);
    assert_eq!(first(&[b"2\r"]), None);
    assert_eq!(first(&[b"/model sonnet fast\r"]), None);
    assert_eq!(first(&[b"!ls -la src\r"]), None);
    assert_eq!(first(&[b"# remember to use tabs\r"]), None);
    assert_eq!(first(&[b"sk-4f8a9c2e7b1d3\r"]), None, "one token");
    // The answer is skipped and the real request after it still counts.
    assert_eq!(
        first(&[b"1\r", b"/clear\r", b"build a pricing page\r"]).as_deref(),
        Some("build a pricing page")
    );
}

#[test]
fn arrow_keys_and_function_keys_add_no_text() {
    assert_eq!(
        first(&[b"add \x1b[A\x1b[D\x1bOP\x1b[3~dark mode\r"]).as_deref(),
        Some("add dark mode")
    );
}

#[test]
fn a_bracketed_paste_is_one_request_with_its_newlines_flattened() {
    assert_eq!(
        first(&[
            b"\x1b[200~fix this error:\nTypeError: x is undefined\n\x1b[201~",
            b"\r"
        ])
        .as_deref(),
        Some("fix this error: TypeError: x is undefined")
    );
}

#[test]
fn a_paste_split_across_writes_still_flattens() {
    assert_eq!(
        first(&[b"\x1b[20", b"0~summarise\nthe repo", b"\x1b[201~\r"]).as_deref(),
        Some("summarise the repo")
    );
}

#[test]
fn input_after_the_title_is_decided_costs_nothing_and_changes_nothing() {
    let mut capture = PromptCapture::default();
    capture.feed(b"redesign the website hero\r");
    capture.feed(b"something completely different\r");
    assert_eq!(capture.first_prompt(), Some("redesign the website hero"));
}

#[test]
fn a_runaway_line_is_bounded() {
    let mut capture = PromptCapture::default();
    capture.feed("word ".repeat(10_000).as_bytes());
    capture.feed(b"\r");
    assert!(capture.first_prompt().unwrap().len() <= 2_000);
}
