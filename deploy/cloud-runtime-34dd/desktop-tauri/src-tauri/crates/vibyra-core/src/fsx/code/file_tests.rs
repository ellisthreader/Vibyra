use super::*;
use std::path::PathBuf;

fn project() -> (tempfile::TempDir, PathBuf) {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path().canonicalize().unwrap();
    (temp, root)
}

fn conflict_hash(error: CoreError) -> String {
    let CoreError::Task(message) = error else {
        panic!("not a conflict: {error}");
    };
    message
        .strip_prefix(CONFLICT_PREFIX)
        .expect("conflict prefix")
        .to_string()
}

#[test]
fn reads_text_with_hash_and_relative_path() {
    let (_temp, root) = project();
    std::fs::create_dir(root.join("src")).unwrap();
    std::fs::write(root.join("src/a.txt"), "hello").unwrap();
    let file = read_file(&root, "src/a.txt").unwrap();
    assert_eq!(file.text, "hello");
    assert_eq!(file.rel_path, "src/a.txt");
    assert_eq!(file.path, root.join("src/a.txt").to_str().unwrap());
    assert_eq!(
        file.hash,
        "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
    );
    assert_eq!(file.size, 5);
    assert!(!file.binary && !file.lossy && !file.read_only);
    assert!(file.mtime_ms.is_some());
}

#[test]
fn binary_and_invalid_utf8_are_flagged_and_never_editable() {
    let (_temp, root) = project();
    std::fs::write(root.join("bin"), b"abc\0def").unwrap();
    std::fs::write(root.join("latin"), b"caf\xe9").unwrap();
    let binary = read_file(&root, "bin").unwrap();
    assert!(binary.binary && binary.read_only);
    assert_eq!(binary.text, "");
    let lossy = read_file(&root, "latin").unwrap();
    assert!(lossy.lossy && lossy.read_only && !lossy.binary);
    assert_eq!(lossy.text, "caf\u{fffd}");
}

#[test]
fn large_files_are_read_only_and_huge_ones_refused() {
    let (_temp, root) = project();
    std::fs::write(root.join("big.txt"), "x".repeat(64)).unwrap();
    assert!(read_with_limit(&root, "big.txt", 63).unwrap().read_only);
    assert!(!read_with_limit(&root, "big.txt", 64).unwrap().read_only);
    let huge = std::fs::File::create(root.join("huge.txt")).unwrap();
    huge.set_len(MAX_FILE_BYTES + 1).unwrap();
    let error = read_file(&root, "huge.txt").unwrap_err().to_string();
    assert!(error.contains("larger than 10 MB"), "{error}");
}

#[test]
fn saves_when_the_hash_matches_and_leaves_no_temp_file() {
    let (_temp, root) = project();
    std::fs::write(root.join("a.txt"), "one").unwrap();
    let read = read_file(&root, "a.txt").unwrap();
    let saved = write_file(&root, "a.txt", "two", Some(&read.hash)).unwrap();
    assert_eq!(std::fs::read_to_string(root.join("a.txt")).unwrap(), "two");
    assert_eq!(saved.hash, read_file(&root, "a.txt").unwrap().hash);
    assert_eq!(saved.size, 3);
    assert_eq!(std::fs::read_dir(&root).unwrap().count(), 1);
}

#[test]
fn refuses_a_save_when_the_file_changed_since_it_was_read() {
    let (_temp, root) = project();
    std::fs::write(root.join("a.txt"), "one").unwrap();
    let read = read_file(&root, "a.txt").unwrap();
    std::fs::write(root.join("a.txt"), "agent").unwrap();
    let error = write_file(&root, "a.txt", "mine", Some(&read.hash)).unwrap_err();
    assert_eq!(conflict_hash(error), sha256_hex(b"agent"));
    assert_eq!(
        std::fs::read_to_string(root.join("a.txt")).unwrap(),
        "agent"
    );
}

#[test]
fn a_new_file_save_conflicts_when_the_file_exists_or_vanished() {
    let (_temp, root) = project();
    std::fs::write(root.join("a.txt"), "there").unwrap();
    let error = write_file(&root, "a.txt", "new", None).unwrap_err();
    assert_eq!(conflict_hash(error), sha256_hex(b"there"));
    let error = write_file(&root, "gone.txt", "x", Some(&sha256_hex(b"x"))).unwrap_err();
    assert_eq!(conflict_hash(error), "missing");
    assert!(!root.join("gone.txt").exists());
}

#[test]
fn creates_a_new_file_when_none_is_expected() {
    let (_temp, root) = project();
    std::fs::create_dir(root.join("src")).unwrap();
    let saved = write_file(&root, "src/new.rs", "fn x() {}", None).unwrap();
    assert_eq!(
        std::fs::read_to_string(root.join("src/new.rs")).unwrap(),
        "fn x() {}"
    );
    assert_eq!(saved.hash, sha256_hex(b"fn x() {}"));
    assert_eq!(std::fs::read_dir(root.join("src")).unwrap().count(), 1);
    assert!(write_file(&root, "../escape.txt", "x", None).is_err());
    assert!(write_file(&root, ".git/config", "x", None).is_err());
}

#[cfg(unix)]
#[test]
fn keeps_the_file_mode() {
    use std::os::unix::fs::PermissionsExt;
    let (_temp, root) = project();
    let script = root.join("run.sh");
    std::fs::write(&script, "#!/bin/sh\n").unwrap();
    std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o751)).unwrap();
    let hash = read_file(&root, "run.sh").unwrap().hash;
    write_file(&root, "run.sh", "#!/bin/sh\necho hi\n", Some(&hash)).unwrap();
    let mode = script.metadata().unwrap().permissions().mode() & 0o777;
    assert_eq!(mode, 0o751);
}

#[test]
fn refuses_text_over_the_cap() {
    let (_temp, root) = project();
    let text = "x".repeat(MAX_FILE_BYTES as usize + 1);
    assert!(write_file(&root, "big.txt", &text, None).is_err());
    assert!(!root.join("big.txt").exists());
}
