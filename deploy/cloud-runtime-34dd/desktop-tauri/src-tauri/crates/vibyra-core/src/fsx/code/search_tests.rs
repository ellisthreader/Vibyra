use super::super::search_lines::WINDOW_CHARS;
use super::super::test_git;
use super::*;

fn options(query: &str) -> SearchOptions {
    SearchOptions {
        query: query.into(),
        ..SearchOptions::default()
    }
}

fn project() -> (tempfile::TempDir, std::path::PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    (temp, root)
}

fn put(root: &Path, rel: &str, text: &str) {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, text).unwrap();
}

fn found(report: &SearchReport) -> Vec<&str> {
    report
        .files
        .iter()
        .map(|file| file.rel_path.as_str())
        .collect()
}

#[test]
fn finds_lines_in_path_order_with_the_hash_of_what_was_read() {
    let (_temp, root) = project();
    put(
        &root,
        "src/b.ts",
        "let needle = 1;\nnothing\nNeedle again, needle",
    );
    put(&root, "a.md", "a needle");
    put(&root, "node_modules/dep/x.js", "needle");
    let report = search(&root, &options("needle")).unwrap();
    assert_eq!(found(&report), ["a.md", "src/b.ts"]);
    assert_eq!(report.matches, 4);
    let file = &report.files[1];
    assert_eq!(
        file.hash,
        sha256_hex(&std::fs::read(root.join("src/b.ts")).unwrap())
    );
    assert_eq!(
        file.lines.iter().map(|l| l.line).collect::<Vec<_>>(),
        [1, 3]
    );
    assert_eq!(file.lines[0].ranges, [[4, 10]]);
    assert_eq!(file.lines[1].ranges, [[0, 6], [14, 20]]);
    assert!(file.lines[0].after.is_none());
}

#[test]
fn case_and_whole_word_options_apply() {
    let (_temp, root) = project();
    put(&root, "a.txt", "Cat cat concat");
    let mut query = options("cat");
    query.case_sensitive = true;
    assert_eq!(search(&root, &query).unwrap().matches, 2);
    query.whole_word = true;
    assert_eq!(search(&root, &query).unwrap().matches, 1);
}

#[test]
fn a_git_project_leaves_out_what_gitignore_names() {
    let (_temp, root) = project();
    test_git::run(&root, &["init", "-q"]);
    put(&root, ".gitignore", "secret.txt\nout/\n");
    put(&root, "secret.txt", "needle");
    put(&root, "out/gen.js", "needle");
    put(&root, "kept.txt", "needle");
    put(&root, ".git/hooks/x", "needle");
    let report = search(&root, &options("needle")).unwrap();
    assert_eq!(found(&report), ["kept.txt"]);
}

#[test]
fn binary_oversized_and_non_utf8_files_are_skipped_and_counted() {
    let (_temp, root) = project();
    std::fs::write(root.join("bin.dat"), b"needle\0\x01\x02").unwrap();
    std::fs::write(root.join("latin.txt"), b"needle \xff\xfe").unwrap();
    put(
        &root,
        "big.txt",
        &format!("needle{}", " ".repeat(MAX_SEARCH_FILE_BYTES as usize)),
    );
    put(&root, "ok.txt", "needle");
    let report = search(&root, &options("needle")).unwrap();
    assert_eq!(found(&report), ["ok.txt"]);
    assert_eq!(report.skipped_binary, 2);
    assert_eq!(report.skipped_large, 1);
}

#[cfg(unix)]
#[test]
fn links_are_never_followed() {
    let (_temp, root) = project();
    let (_other, outside) = project();
    put(&outside, "stolen.txt", "needle");
    put(&outside, "dir/deep.txt", "needle");
    std::os::unix::fs::symlink(outside.join("stolen.txt"), root.join("file-link.txt")).unwrap();
    std::os::unix::fs::symlink(outside.join("dir"), root.join("dir-link")).unwrap();
    put(&root, "real.txt", "needle");
    let report = search(&root, &options("needle")).unwrap();
    assert_eq!(found(&report), ["real.txt"]);
}

#[test]
fn the_result_cap_stops_the_search_and_says_so() {
    let (_temp, root) = project();
    for name in ["a", "b", "c"] {
        put(&root, &format!("{name}.txt"), "x x x x");
    }
    let limits = Limits {
        matches: 5,
        ..Limits::default()
    };
    let report = search_with(&root, &options("x"), limits).unwrap();
    assert_eq!(report.matches, 5);
    assert_eq!(report.truncated, Some("matches"));
    assert_eq!(report.files.last().unwrap().count, 1);
}

#[test]
fn the_byte_and_time_budgets_stop_the_search() {
    let (_temp, root) = project();
    put(&root, "a.txt", "needle needle needle");
    put(&root, "b.txt", "needle");
    let bytes = Limits {
        bytes: 10,
        ..Limits::default()
    };
    assert_eq!(
        search_with(&root, &options("needle"), bytes)
            .unwrap()
            .truncated,
        Some("bytes")
    );
    let time = Limits {
        time: Duration::ZERO,
        ..Limits::default()
    };
    assert_eq!(
        search_with(&root, &options("needle"), time)
            .unwrap()
            .truncated,
        Some("time")
    );
}

#[test]
fn long_lines_are_windowed_around_the_first_match() {
    let (_temp, root) = project();
    put(
        &root,
        "a.txt",
        &format!("{}needle{}", "ab".repeat(300), "cd".repeat(300)),
    );
    let mut query = options("needle");
    query.replacement = Some("THREAD".into());
    let report = search(&root, &query).unwrap();
    let line = &report.files[0].lines[0];
    assert!(line.text.chars().count() <= WINDOW_CHARS);
    let [from, to] = line.ranges[0];
    let hit: String = line
        .text
        .chars()
        .skip(from as usize)
        .take((to - from) as usize)
        .collect();
    assert_eq!(hit, "needle");
    let after = line.after.as_deref().unwrap();
    assert!(after.contains("THREAD") && !after.contains("needle"));
}

#[test]
fn an_empty_query_is_refused() {
    let (_temp, root) = project();
    assert!(search(&root, &options("")).is_err());
}
