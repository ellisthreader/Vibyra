use super::*;

#[test]
fn counts_every_kind_of_entry_once() {
    let raw = "# branch.oid abc\0# branch.head vibyra/x\0\
1 .M N... 100644 100644 100644 a b src/a.rs\0\
1 M. N... 100644 100644 100644 a b src/b.rs\0\
2 R. N... 100644 100644 100644 a b R100 new name.rs\0old name.rs\0\
u UU N... 100644 100644 100644 100644 a b c conflict.rs\0\
? notes.txt\0! target/x\0";
    assert_eq!(count_entries(raw), (5, 2, 1, 1));
    assert_eq!(count_entries(""), (0, 0, 0, 0));
}

#[test]
fn reads_headers_by_name() {
    let raw =
        "# branch.oid abc\0# branch.head main\0# branch.upstream origin/main\0# branch.ab +2 -1\0";
    assert_eq!(header(raw, "branch.head"), Some("main"));
    assert_eq!(header(raw, "branch.ab"), Some("+2 -1"));
    assert_eq!(header(raw, "branch.missing"), None);
}
