use super::*;

const FILE: &str = "# keep me\nA=1\nexport B=\"two words\"  # why\n\nC='x'\nA=again\n";

#[test]
fn set_rewrites_one_entry_and_keeps_everything_else() {
    let out = set(FILE, "B", "three words").unwrap();
    assert_eq!(
        out,
        "# keep me\nA=1\nexport B=\"three words\"  # why\n\nC='x'\nA=again\n"
    );
    // The last of a repeated key is the one that wins, so it is the one edited.
    assert_eq!(
        set(FILE, "A", "9").unwrap(),
        "# keep me\nA=1\nexport B=\"two words\"  # why\n\nC='x'\nA=9\n"
    );
    assert_eq!(
        set(FILE, "C", "it's").unwrap().lines().nth(4),
        Some("C=\"it's\"")
    );
}

#[test]
fn set_adds_a_missing_key_with_the_files_line_ending() {
    assert_eq!(
        set("A=1\r\nB=2", "N", "x y").unwrap(),
        "A=1\r\nB=2\r\nN=\"x y\"\r\n"
    );
    assert_eq!(set("", "N", "1").unwrap(), "N=1\n");
}

#[test]
fn crlf_is_kept_on_rewritten_lines() {
    assert_eq!(set("A=1\r\nB=2\r\n", "A", "5").unwrap(), "A=5\r\nB=2\r\n");
}

#[test]
fn a_multi_line_value_is_replaced_whole() {
    let out = set("K=\"a\nb\"\nZ=1\n", "K", "one").unwrap();
    assert_eq!(out, "K=one\nZ=1\n");
}

#[test]
fn delete_removes_every_occurrence_only() {
    assert_eq!(
        delete(FILE, "A").unwrap(),
        "# keep me\nexport B=\"two words\"  # why\n\nC='x'\n"
    );
    assert_eq!(delete(FILE, "NOPE"), None);
}

#[test]
fn bad_keys_and_values_are_refused() {
    assert!(set("", "1BAD", "x").is_err());
    assert!(set("", "A B", "x").is_err());
    assert!(set("", "A", "x\0y").is_err());
    assert!(set("", "A", &"x".repeat(MAX_VALUE + 1)).is_err());
}
