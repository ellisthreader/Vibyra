use super::conflict_parse::{parse, Segment};
use super::tests_support::*;
use super::{list_conflicts, read_conflict, resolve_conflict, switch_branch, Choice, SwitchMode};

#[test]
fn parse_splits_text_and_hunks_and_keeps_line_endings() {
    let source = "top\r\n<<<<<<< HEAD\r\nours\r\n=======\r\ntheirs\r\n>>>>>>> side\r\nend\r\n";
    let segments = parse(source).unwrap();
    assert_eq!(segments.len(), 3);
    assert_eq!(
        segments[0],
        Segment::Text {
            text: "top\r\n".into()
        }
    );
    assert_eq!(
        segments[1],
        Segment::Conflict {
            ours: "ours\r\n".into(),
            theirs: "theirs\r\n".into(),
            ours_label: "HEAD".into(),
            theirs_label: "side".into()
        }
    );
}

#[test]
fn parse_skips_the_diff3_base_and_refuses_broken_or_nested_markers() {
    let diff3 = "<<<<<<< HEAD\na\n||||||| base\nold\n=======\nb\n>>>>>>> x\n";
    match &parse(diff3).unwrap()[0] {
        Segment::Conflict { ours, theirs, .. } => {
            assert_eq!((ours.as_str(), theirs.as_str()), ("a\n", "b\n"))
        }
        other => panic!("{other:?}"),
    }
    for bad in [
        "<<<<<<< a\nx\n",
        "<<<<<<< a\n<<<<<<< b\n=======\n>>>>>>> c\n",
        "<<<<<<< a\nx\n=======\ny\n",
    ] {
        assert!(parse(bad).is_err(), "{bad:?}");
    }
    assert_eq!(
        parse("Title\n=======\nbody\n").unwrap().len(),
        1,
        "a setext heading is just text"
    );
}

#[test]
fn each_hunk_takes_ours_theirs_or_both_then_the_file_is_staged() {
    let r = conflicted();
    assert_eq!(list_conflicts(&r.root).unwrap(), ["a.txt"]);
    let doc = read_conflict(&r.root, "a.txt").unwrap();
    assert_eq!(doc.hunks, 1);
    let done = resolve_conflict(&r.root, "a.txt", &doc.hash, &[Choice::Both]).unwrap();
    assert_eq!(done.remaining, 0);
    assert_eq!(r.read("a.txt"), "one\nMAIN\nSIDE\nthree\nside tail\n");
    assert!(list_conflicts(&r.root).unwrap().is_empty());
    assert_eq!(
        r.git(&["diff", "--name-only", "--diff-filter=U"]),
        "",
        "staging marks it resolved"
    );
    r.git(&["commit", "-m", "merged"]);
}

#[test]
fn ours_and_theirs_pick_one_side() {
    for (choice, middle) in [(Choice::Ours, "MAIN"), (Choice::Theirs, "SIDE")] {
        let r = conflicted();
        let doc = read_conflict(&r.root, "a.txt").unwrap();
        resolve_conflict(&r.root, "a.txt", &doc.hash, &[choice]).unwrap();
        assert!(r.read("a.txt").contains(&format!("\n{middle}\n")));
        assert!(!r.read("a.txt").contains("<<<<"));
    }
}

#[test]
fn a_changed_file_a_missing_choice_and_other_paths_are_refused() {
    let r = conflicted();
    let doc = read_conflict(&r.root, "a.txt").unwrap();
    let stale = resolve_conflict(&r.root, "a.txt", "deadbeef", &[Choice::Ours]).unwrap_err();
    assert!(stale.message().starts_with("code-conflict:"));
    assert!(resolve_conflict(&r.root, "a.txt", &doc.hash, &[]).is_err());
    assert!(r.read("a.txt").contains("<<<<<<<"), "nothing was written");
    let outside = tempfile::tempdir().unwrap();
    std::fs::write(outside.path().join("x.txt"), "x").unwrap();
    for path in [
        "../x.txt",
        "b.txt",
        ".git/HEAD",
        outside.path().join("x.txt").to_str().unwrap(),
    ] {
        assert!(read_conflict(&r.root, path).is_err(), "{path}");
        assert!(
            resolve_conflict(&r.root, path, &doc.hash, &[Choice::Ours]).is_err(),
            "{path}"
        );
    }
    std::fs::write(
        r.root.join("a.txt"),
        "edited meanwhile\n<<<<<<< a\nx\n=======\ny\n>>>>>>> b\n",
    )
    .unwrap();
    assert!(
        resolve_conflict(&r.root, "a.txt", &doc.hash, &[Choice::Ours]).is_err(),
        "the hash no longer matches"
    );
}

#[test]
fn switching_is_refused_while_files_are_unmerged() {
    let r = conflicted();
    r.git(&["branch", "other"]);
    assert!(switch_branch(&r.root, "other", SwitchMode::Stash)
        .unwrap_err()
        .message()
        .contains("conflicts"));
}
