use super::*;

fn one(text: &str) -> Vec<Parsed> {
    parse(&split_lines(text))
}

#[test]
fn reads_plain_exported_quoted_and_commented_entries() {
    let found = one("# top\nA=1\nexport B = two # note\nC=\"x y\"   # c\nD='lit $x'\n\nE=\n");
    let keys: Vec<_> = found
        .iter()
        .map(|e| (e.key.as_str(), e.value.as_str()))
        .collect();
    assert_eq!(
        keys,
        [
            ("A", "1"),
            ("B", "two"),
            ("C", "x y"),
            ("D", "lit $x"),
            ("E", "")
        ]
    );
    assert!(found[1].exported && found[1].suffix == " # note");
    assert_eq!(found[2].quote, Quote::Double);
    assert_eq!(found[2].suffix, "   # c");
    assert_eq!(found[3].quote, Quote::Single);
}

#[test]
fn a_double_quoted_value_can_span_lines_and_hold_escapes() {
    let found = one("KEY=\"-----BEGIN\nline2\\n\"\nNEXT=1\n");
    assert_eq!(found[0].value, "-----BEGIN\nline2\n");
    assert_eq!((found[0].first, found[0].last), (0, 1));
    assert_eq!(found[1].key, "NEXT");
}

#[test]
fn an_unclosed_quote_is_skipped_not_swallowed() {
    let found = one("BAD=\"never closed\nOK=1\n");
    assert_eq!(
        found.iter().map(|e| e.key.as_str()).collect::<Vec<_>>(),
        ["OK"]
    );
}

#[test]
fn lines_that_are_not_entries_are_ignored() {
    assert!(one("not an entry\n=novalue\n1BAD=x\n#C=1\n").is_empty());
}

#[test]
fn encoding_quotes_only_when_it_has_to() {
    assert_eq!(encode("abc-1.2/x", Quote::None), "abc-1.2/x");
    assert_eq!(encode("", Quote::None), "");
    assert_eq!(encode("a b", Quote::None), "\"a b\"");
    assert_eq!(encode("a b", Quote::Single), "'a b'");
    assert_eq!(encode("it's # x", Quote::Single), "\"it's # x\"");
    assert_eq!(encode("l1\nl2\"q", Quote::None), "\"l1\\nl2\\\"q\"");
}

#[test]
fn what_is_encoded_reads_back_the_same() {
    for value in [
        "plain",
        "with space",
        "hash # inside",
        "quote\"d",
        "multi\nline",
        "back\\slash",
        "'single'",
    ] {
        let line = format!("K={}\n", encode(value, Quote::None));
        assert_eq!(one(&line)[0].value, value, "{value}");
    }
}
