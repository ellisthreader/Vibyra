use crate::report::{validate, Report, ReportContext};
use crate::report_text::terminal_tail;

fn report() -> Report {
    Report {
        kind: "bug".into(),
        severity: "high".into(),
        summary: "Terminal goes blank on resize".into(),
        details: "Dragging the divider quickly leaves the pane empty.".into(),
        steps: Some("1. Open two panes\n2. Drag the divider".into()),
        expected: Some("The panes reflow.".into()),
        area: Some("Terminal pane".into()),
        contact: Some("ellis".into()),
        context: ReportContext {
            app_version: "0.1.5".into(),
            platform: "linux · x86_64".into(),
            project: Some("HKE".into()),
            project_root: Some("/home/ellis/Desktop/HKE".into()),
            agent: Some("claude".into()),
            model: Some("Claude Opus 5".into()),
            ..ReportContext::default()
        },
        screenshot: None,
        image_paths: Vec::new(),
        session_id: None,
    }
}

#[test]
fn a_report_that_says_nothing_is_refused_before_it_is_sent() {
    let mut blank = report();
    blank.summary = "   ".into();
    assert!(validate(&blank).is_err());
    let mut detailless = report();
    detailless.details = String::new();
    assert!(validate(&detailless).is_err());
    assert!(validate(&report()).is_ok());
}

#[test]
fn a_report_longer_than_a_person_would_type_is_refused() {
    let mut huge = report();
    huge.details = "x".repeat(9_000);
    assert!(validate(&huge).is_err());
}

#[test]
fn terminal_output_arrives_readable_rather_than_as_line_noise() {
    let raw = "\u{1b}[32mbuilding\u{1b}[0m\r\n\u{1b}]0;title\u{7}done\n";
    let tail = terminal_tail(raw);
    assert!(!tail.contains('\u{1b}'));
    assert!(!tail.contains('\r'));
    assert!(tail.contains("building"));
    assert!(tail.contains("done"));
    assert!(!tail.contains("title"));
}

#[test]
fn terminal_output_keeps_the_end_where_the_failure_is() {
    let raw = (0..400)
        .map(|n| format!("line {n}"))
        .collect::<Vec<_>>()
        .join("\n");
    let tail = terminal_tail(&raw);
    assert!(tail.contains("line 399"));
    assert!(!tail.contains("line 1\n"));
    assert!(tail.lines().count() <= 120);
}
