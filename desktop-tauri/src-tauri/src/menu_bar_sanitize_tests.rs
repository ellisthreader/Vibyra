use super::tests::snap;
use super::*;

#[test]
fn names_are_one_clean_bounded_line() {
    assert_eq!(clean("  a\n\tb\u{7}  ", 40, "x"), "a b");
    assert_eq!(clean("\n\n", 40, "Terminal"), "Terminal");
    let long = clean(&"word ".repeat(30), 12, "x");
    assert!(long.ends_with('…') && long.chars().count() <= 12);
}

#[test]
fn sanitize_bounds_every_list() {
    let mut big = snap(20, 20);
    big.recent = (0..9)
        .map(|i| RecentRow {
            key: format!("t:{i}"),
            title: "t".into(),
            agent: String::new(),
            outcome: Outcome::Done,
        })
        .collect();
    let s = sanitize(big);
    assert_eq!(
        (s.attention.len(), s.working.len(), s.recent.len()),
        (6, 6, 3)
    );
}

#[test]
fn rows_with_unsafe_keys_are_dropped() {
    let mut s = snap(0, 0);
    s.attention = vec![
        StatusRow {
            key: "t:1".into(),
            title: "ok".into(),
            project: String::new(),
            agent: String::new(),
        },
        StatusRow {
            key: "../../x y".into(),
            title: "bad".into(),
            project: String::new(),
            agent: String::new(),
        },
        StatusRow {
            key: String::new(),
            title: "empty".into(),
            project: String::new(),
            agent: String::new(),
        },
    ];
    let keys: Vec<String> = sanitize(s).attention.into_iter().map(|r| r.key).collect();
    assert_eq!(keys, ["t:1"]);
    assert!(valid_key("phone") && valid_key("m:agent_7") && !valid_key("a/b"));
}

#[test]
fn agent_ids_can_only_name_a_logo() {
    let mut s = snap(0, 1);
    s.working[0].agent = "Claude-Code/../x".into();
    assert_eq!(sanitize(s).working[0].agent, "claudecodex");
    assert_eq!(agent_name("gemini"), Some("Gemini"));
    assert_eq!(agent_name("shell"), None);
}
