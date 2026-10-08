use super::*;
use crate::menu_bar_glyph::{draw, SIZE};

fn row(id: u32, title: &str, project: &str) -> StatusRow {
    StatusRow {
        key: format!("t:{id}"),
        title: title.into(),
        project: project.into(),
        agent: if title == "Claude" {
            "claude".into()
        } else {
            "codex".into()
        },
    }
}

pub(super) fn snap(attention: usize, working: usize) -> StatusSnapshot {
    StatusSnapshot {
        enabled: true,
        attention: (0..attention as u32)
            .map(|i| row(i, "Claude", "Vibyra"))
            .collect(),
        working: (0..working as u32)
            .map(|i| row(100 + i, "Codex", ""))
            .collect(),
        recent: vec![],
    }
}

#[test]
fn the_title_speaks_only_when_there_is_something_to_say() {
    assert_eq!(title(&snap(0, 0)), None);
    // Who and what: the model, then the task, then how many more.
    assert_eq!(title(&snap(0, 1)).as_deref(), Some("Codex · Codex"));
    assert_eq!(title(&snap(0, 2)).as_deref(), Some("Codex · Codex +1"));
    assert_eq!(title(&snap(1, 3)).as_deref(), Some("Claude needs you"));
    assert_eq!(title(&snap(2, 0)).as_deref(), Some("2 need you"));
    let mut long = snap(0, 1);
    long.working[0].title = "Refactor the whole authentication flow".into();
    assert_eq!(
        title(&long).as_deref(),
        Some("Codex · Refactor the whole au…")
    );
}

#[test]
fn needing_you_outranks_working_in_the_glyph() {
    assert_eq!(glyph(&snap(0, 0)), Glyph::Idle);
    assert_eq!(glyph(&snap(0, 1)), Glyph::Working);
    assert_eq!(glyph(&snap(1, 1)), Glyph::Attention);
}

#[test]
fn the_dock_badge_counts_only_waiting_agents_and_clears() {
    assert_eq!(badge(&snap(0, 4)), None);
    assert_eq!(badge(&snap(3, 0)), Some(3));
    let mut off = snap(3, 0);
    off.enabled = false;
    assert_eq!(badge(&off), None);
}

#[test]
fn the_menu_groups_rows_and_always_offers_show() {
    let mut s = snap(1, 1);
    s.recent = vec![RecentRow {
        key: "c:abc-1".into(),
        title: "Build".into(),
        agent: "codex".into(),
        outcome: Outcome::Failed,
    }];
    let labels: Vec<String> = lines(&s)
        .into_iter()
        .map(|l| l.map(|line| line.label).unwrap_or_else(|| "—".into()))
        .collect();
    assert_eq!(
        labels,
        [
            "Needs you",
            "Claude    Claude · Vibyra",
            "—",
            "Working",
            "Codex    Codex",
            "—",
            "Recent",
            "✕ Build",
            "—",
            "Show Vibyra"
        ]
    );
    let rows = lines(&s);
    assert_eq!(rows[1].as_ref().unwrap().id, "live-status-open-t:0");
    assert_eq!(
        rows[1].as_ref().unwrap().agent,
        "claude",
        "the row carries its logo"
    );
    assert_eq!(rows[7].as_ref().unwrap().id, "live-status-open-c:abc-1");
    assert!(
        !rows[0].as_ref().unwrap().enabled,
        "headers are not clickable"
    );
}

#[test]
fn an_empty_menu_says_so() {
    let first = lines(&snap(0, 0)).remove(0).unwrap();
    assert_eq!(
        (first.label.as_str(), first.enabled),
        ("No agents running", false)
    );
}

#[test]
fn the_renderer_contract_deserialises() {
    let s: StatusSnapshot = serde_json::from_str(
        r#"{"enabled":true,"attention":[{"key":"t:3","title":"Claude","project":"Web"}],
            "working":[],"recent":[{"key":"c:x","title":"Codex","outcome":"done"}]}"#,
    )
    .unwrap();
    assert_eq!(s.attention[0].key, "t:3");
    assert_eq!(s.recent[0].outcome, Outcome::Done);
}

#[test]
fn every_glyph_is_a_distinct_template_image() {
    let images: Vec<Vec<u8>> = [Glyph::Idle, Glyph::Working, Glyph::Attention]
        .into_iter()
        .map(|g| draw(g).0)
        .collect();
    for image in &images {
        assert_eq!(image.len(), (SIZE * SIZE * 4) as usize);
        assert!(
            image.chunks(4).all(|p| p[..3] == [0, 0, 0]),
            "template images are black"
        );
        assert!(image.chunks(4).any(|p| p[3] == 255));
    }
    assert!(images[0] != images[1] && images[1] != images[2]);
}
