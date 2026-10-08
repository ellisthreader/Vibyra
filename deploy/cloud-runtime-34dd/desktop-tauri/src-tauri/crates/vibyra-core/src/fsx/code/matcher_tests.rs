use super::*;

fn matcher(query: &str, case_sensitive: bool, whole_word: bool) -> Matcher {
    Matcher::new(&SearchOptions {
        query: query.into(),
        case_sensitive,
        whole_word,
        replacement: None,
    })
    .unwrap()
}

#[test]
fn finds_literal_matches_without_overlap() {
    let m = matcher("aa", true, false);
    assert_eq!(m.find("aaaa a aa"), [(0, 2), (2, 4), (7, 9)]);
    // Pattern characters are plain text.
    assert_eq!(matcher("a.c", true, false).find("abc a.c"), [(4, 7)]);
}

#[test]
fn case_folding_keeps_byte_offsets_right_for_wide_characters() {
    let m = matcher("café", false, false);
    let line = "é CAFÉ and Café";
    let spans = m.find(line);
    assert_eq!(spans.len(), 2);
    for (start, end) in spans {
        assert!(line[start..end].to_lowercase() == "café");
    }
    assert_eq!(matcher("Fox", true, false).find("fox Fox"), [(4, 7)]);
}

#[test]
fn whole_word_needs_a_word_edge_on_both_sides() {
    let m = matcher("log", true, true);
    assert_eq!(m.find("log, catalog, log_two, (log)"), [(0, 3), (24, 27)]);
}

#[test]
fn replace_keeps_every_line_ending() {
    let m = matcher("cat", true, false);
    let (out, count) = m.replace_text("a cat\r\ncat\ncat", "dog");
    assert_eq!(out, "a dog\r\ndog\ndog");
    assert_eq!(count, 3);
    assert_eq!(m.replace_text("none\n", "x"), ("none\n".to_owned(), 0));
}

#[test]
fn overlong_lines_are_left_alone() {
    let line = "x".repeat(MAX_LINE_BYTES + 1);
    assert!(matcher("x", true, false).find(&line).is_empty());
}

#[test]
fn bad_queries_are_refused() {
    for query in ["", "a\nb", "a\0b", &"q".repeat(MAX_QUERY_CHARS + 1)] {
        let options = SearchOptions {
            query: query.into(),
            ..SearchOptions::default()
        };
        assert!(Matcher::new(&options).is_err(), "{query:?}");
    }
    let options = SearchOptions {
        query: "a".into(),
        replacement: Some("x\0".into()),
        ..SearchOptions::default()
    };
    assert!(Matcher::new(&options).is_err());
}
