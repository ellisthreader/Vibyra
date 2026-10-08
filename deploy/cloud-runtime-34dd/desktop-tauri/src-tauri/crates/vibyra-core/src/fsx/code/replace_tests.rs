use super::*;

fn project() -> (tempfile::TempDir, std::path::PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    (temp, root)
}

fn put(root: &Path, rel: &str, bytes: &[u8]) -> String {
    let path = root.join(rel);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, bytes).unwrap();
    sha256_hex(bytes)
}

fn options(with: &str) -> SearchOptions {
    SearchOptions {
        query: "cat".into(),
        replacement: Some(with.into()),
        ..SearchOptions::default()
    }
}

fn target(path: &str, hash: &str) -> ReplaceTarget {
    ReplaceTarget {
        path: path.into(),
        expected_hash: hash.into(),
    }
}

#[test]
fn replaces_atomically_and_keeps_line_endings() {
    let (_temp, root) = project();
    let hash = put(&root, "a.txt", b"one cat\r\ntwo cat\r\n");
    let results = replace_in_files(&root, &options("dog"), &[target("a.txt", &hash)]).unwrap();
    assert_eq!(results[0].replaced, 2);
    let now = std::fs::read(root.join("a.txt")).unwrap();
    assert_eq!(now, b"one dog\r\ntwo dog\r\n");
    assert_eq!(results[0].hash.as_deref(), Some(sha256_hex(&now).as_str()));
    let leftovers = std::fs::read_dir(&root).unwrap().count();
    assert_eq!(leftovers, 1, "no temp file is left behind");
}

#[test]
fn a_file_that_changed_since_the_search_is_left_alone() {
    let (_temp, root) = project();
    let hash = put(&root, "a.txt", b"cat");
    std::fs::write(root.join("a.txt"), "cat, edited meanwhile").unwrap();
    let results = replace_in_files(&root, &options("dog"), &[target("a.txt", &hash)]).unwrap();
    assert!(results[0].conflict);
    assert_eq!(
        std::fs::read_to_string(root.join("a.txt")).unwrap(),
        "cat, edited meanwhile"
    );
}

#[test]
fn one_refusal_does_not_stop_the_others() {
    let (_temp, root) = project();
    let good = put(&root, "good.txt", b"cat");
    let binary = put(&root, "bin.dat", b"cat\0\0");
    let results = replace_in_files(
        &root,
        &options("dog"),
        &[
            target("bin.dat", &binary),
            target("missing.txt", "0"),
            target("good.txt", &good),
        ],
    )
    .unwrap();
    assert!(results[0].error.is_some() && !results[0].conflict);
    assert!(results[1].error.is_some());
    assert_eq!(results[2].replaced, 1);
    assert_eq!(
        std::fs::read_to_string(root.join("good.txt")).unwrap(),
        "dog"
    );
}

#[test]
fn paths_outside_the_project_or_inside_git_are_refused() {
    let (_temp, root) = project();
    let (_other, outside) = project();
    let hash = put(&outside, "x.txt", b"cat");
    put(&root, ".git/config", b"cat");
    let absolute = outside.join("x.txt").to_string_lossy().into_owned();
    let results = replace_in_files(
        &root,
        &options("dog"),
        &[
            target(&absolute, &hash),
            target("../x.txt", &hash),
            target(".git/config", &hash),
        ],
    )
    .unwrap();
    assert!(results.iter().all(|result| result.error.is_some()));
    assert_eq!(
        std::fs::read_to_string(outside.join("x.txt")).unwrap(),
        "cat"
    );
}

#[cfg(unix)]
#[test]
fn a_link_is_never_written_through() {
    let (_temp, root) = project();
    let (_other, outside) = project();
    let hash = put(&outside, "real/x.txt", b"cat");
    std::os::unix::fs::symlink(outside.join("real/x.txt"), root.join("file-link.txt")).unwrap();
    std::os::unix::fs::symlink(outside.join("real"), root.join("dir-link")).unwrap();
    let results = replace_in_files(
        &root,
        &options("dog"),
        &[
            target("file-link.txt", &hash),
            target("dir-link/x.txt", &hash),
        ],
    )
    .unwrap();
    assert!(
        results.iter().all(|result| result.error.is_some()),
        "{results:?}"
    );
    assert_eq!(
        std::fs::read_to_string(outside.join("real/x.txt")).unwrap(),
        "cat"
    );
}

#[test]
fn a_file_with_no_match_is_not_rewritten() {
    let (_temp, root) = project();
    let hash = put(&root, "a.txt", b"nothing here");
    let before = std::fs::metadata(root.join("a.txt"))
        .unwrap()
        .modified()
        .unwrap();
    let results = replace_in_files(&root, &options("dog"), &[target("a.txt", &hash)]).unwrap();
    assert_eq!((results[0].replaced, results[0].hash.clone()), (0, None));
    assert_eq!(
        std::fs::metadata(root.join("a.txt"))
            .unwrap()
            .modified()
            .unwrap(),
        before
    );
}

#[test]
fn the_request_itself_is_checked() {
    let (_temp, root) = project();
    let mut none = options("dog");
    none.replacement = None;
    assert!(replace_in_files(&root, &none, &[target("a", "0")]).is_err());
    assert!(replace_in_files(&root, &options("dog"), &[]).is_err());
    let many: Vec<_> = (0..=MAX_REPLACE_FILES)
        .map(|n| target(&format!("{n}"), "0"))
        .collect();
    assert!(replace_in_files(&root, &options("dog"), &many).is_err());
}
