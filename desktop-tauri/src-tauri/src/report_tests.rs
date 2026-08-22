use crate::report::{report_id, validate, Report, ReportContext};
use crate::report_format::embed;
use crate::report_text::{context_text, terminal_tail};

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

fn embed_of(report: &Report, has_shot: bool) -> serde_json::Value {
    embed(report, "VR-TESTID", has_shot)["embeds"][0].clone()
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
fn the_title_leads_with_kind_and_severity_so_a_channel_can_be_skimmed() {
    let title = embed_of(&report(), false)["title"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(title.starts_with("🐞 Bug · High — "));
    assert!(title.contains("Terminal goes blank"));
}

#[test]
fn severity_is_visible_as_colour_before_a_word_is_read() {
    let mut blocker = report();
    blocker.severity = "blocker".into();
    let mut low = report();
    low.severity = "low".into();
    let colour = |value: &Report| embed_of(value, false)["color"].as_u64().unwrap();
    assert_ne!(colour(&blocker), colour(&low));
    assert_ne!(colour(&blocker), colour(&report()));
}

#[test]
fn a_home_screen_report_omits_the_workspace_fields_rather_than_dashing_them() {
    let mut homeless = report();
    homeless.context.project = None;
    homeless.context.agent = None;
    homeless.context.model = None;
    let names: Vec<String> = embed_of(&homeless, false)["fields"]
        .as_array()
        .unwrap()
        .iter()
        .map(|field| field["name"].as_str().unwrap().to_owned())
        .collect();
    assert!(!names.contains(&"Project".to_string()));
    assert!(names.contains(&"Where".to_string()));
}

#[test]
fn the_screenshot_is_referenced_only_when_one_was_attached() {
    assert!(embed_of(&report(), false).get("image").is_none());
    assert_eq!(
        embed_of(&report(), true)["image"]["url"].as_str().unwrap(),
        "attachment://screenshot.png"
    );
}

#[test]
fn a_clipped_field_is_marked_so_it_is_not_read_as_the_whole_report() {
    let mut wordy = report();
    wordy.details = "word ".repeat(1_000);
    let description = embed_of(&wordy, false)["description"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(description.chars().count() <= 1_500);
    assert!(description.ends_with('…'));
}

#[test]
fn context_text_carries_what_the_embed_had_to_clip() {
    let mut wordy = report();
    wordy.details = format!("{} UNIQUE_TAIL_MARKER", "word ".repeat(1_000));
    let text = context_text(&wordy, "VR-TESTID", None);
    assert!(text.contains("VR-TESTID"));
    assert!(text.contains("UNIQUE_TAIL_MARKER"));
    assert!(text.contains("/home/ellis/Desktop/HKE"));
    assert!(text.contains("Steps to reproduce"));
}

#[test]
fn an_empty_optional_section_is_left_out_of_the_context_file() {
    let mut bare = report();
    bare.steps = None;
    bare.expected = Some("   ".into());
    let text = context_text(&bare, "VR-TESTID", None);
    assert!(!text.contains("--- Steps to reproduce ---"));
    assert!(!text.contains("--- Expected ---"));
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

#[test]
fn a_report_id_avoids_the_characters_people_misread() {
    for _ in 0..64 {
        let id = report_id();
        assert!(id.starts_with("VR-"));
        assert_eq!(id.len(), 9);
        assert!(!id[3..].contains(['O', '0', 'I', '1', 'U']));
    }
}

#[test]
fn the_person_who_hit_it_is_named_at_the_top_of_the_embed() {
    // Who reported it decides how it can be answered, so it leads the embed
    // rather than sitting in the footer.
    let author = embed_of(&report(), false)["author"]["name"]
        .as_str()
        .unwrap()
        .to_owned();
    assert_eq!(author, "Reported by ellis");
}

#[test]
fn a_report_with_no_contact_still_names_whoever_is_signed_in() {
    let mut anonymous = report();
    anonymous.contact = None;
    anonymous.context.reporter = Some("Ellis (ellis@example.com)".into());
    let author = embed_of(&anonymous, false)["author"]["name"]
        .as_str()
        .unwrap()
        .to_owned();
    assert!(author.contains("ellis@example.com"));
}
