use super::*;

fn project(files: &[(&str, &str)]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (name, body) in files {
        let path = dir.path().join(name);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(path, body).unwrap();
    }
    dir
}

#[test]
fn the_list_finds_env_files_and_skips_dependencies_and_links() {
    let dir = project(&[
        (".env", "A=1"),
        (".env.local", "B=2"),
        (".envrc", "x"),
        ("apps/web/.env.production", "C=3"),
        ("node_modules/pkg/.env", "no"),
        ("src/main.rs", ""),
    ]);
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(dir.path().join(".env"), dir.path().join(".env.link")).unwrap();
        std::os::unix::fs::symlink(dir.path().join("apps"), dir.path().join("linked")).unwrap();
    }
    let paths: Vec<_> = list(dir.path()).into_iter().map(|f| f.path).collect();
    assert_eq!(paths, [".env", ".env.local", "apps/web/.env.production"]);
}

#[test]
fn read_describes_entries_without_returning_values() {
    let dir = project(&[(
        ".env",
        "# c\nTOKEN=abcdef\nexport B=\"x y\"\nTOKEN=second\n",
    )]);
    let doc = read(dir.path(), ".env").unwrap();
    assert_eq!(doc.entries.len(), 3);
    assert_eq!(
        (
            doc.entries[0].key.as_str(),
            doc.entries[0].length,
            doc.entries[0].shadowed
        ),
        ("TOKEN", 6, true)
    );
    assert!(doc.entries[1].exported && doc.entries[1].quoted);
    assert!(!serde_json::to_string(&doc).unwrap().contains("abcdef"));
    assert_eq!(reveal(dir.path(), ".env", "TOKEN").unwrap(), "second");
    assert_eq!(reveal(dir.path(), ".env", "B").unwrap(), "x y");
    assert!(reveal(dir.path(), ".env", "NOPE").is_err());
}

#[test]
fn set_and_delete_write_atomically_and_keep_the_rest() {
    let dir = project(&[(".env", "# top\nA=1\nB=2\n")]);
    let doc = read(dir.path(), ".env").unwrap();
    let saved = set(dir.path(), ".env", "A", "has space", &doc.hash).unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join(".env")).unwrap(),
        "# top\nA=\"has space\"\nB=2\n"
    );
    let saved = delete(dir.path(), ".env", "B", &saved.hash).unwrap();
    assert_eq!(
        std::fs::read_to_string(dir.path().join(".env")).unwrap(),
        "# top\nA=\"has space\"\n"
    );
    set(dir.path(), ".env", "NEW", "9", &saved.hash).unwrap();
    assert!(std::fs::read_to_string(dir.path().join(".env"))
        .unwrap()
        .ends_with("NEW=9\n"));
    let leftovers: Vec<_> = std::fs::read_dir(dir.path())
        .unwrap()
        .flatten()
        .map(|e| e.file_name())
        .collect();
    assert_eq!(leftovers.len(), 1, "no temp file is left behind");
}

#[test]
fn a_file_changed_elsewhere_is_reported_not_overwritten() {
    let dir = project(&[(".env", "A=1\n")]);
    let doc = read(dir.path(), ".env").unwrap();
    std::fs::write(dir.path().join(".env"), "A=1\nB=from-an-editor\n").unwrap();
    let error = set(dir.path(), ".env", "A", "2", &doc.hash)
        .unwrap_err()
        .to_string();
    assert!(error.contains(code::CONFLICT_PREFIX), "{error}");
    assert_eq!(
        std::fs::read_to_string(dir.path().join(".env")).unwrap(),
        "A=1\nB=from-an-editor\n"
    );
}

#[test]
fn only_env_files_inside_the_root_behind_real_folders() {
    let dir = project(&[(".env", "A=1\n"), ("notes.txt", "x"), ("sub/.env", "B=1\n")]);
    let outside = project(&[(".env", "SECRET=1\n")]);
    assert!(read(dir.path(), "notes.txt").is_err());
    assert!(read(dir.path(), "../.env").is_err());
    assert!(read(dir.path(), "/etc/passwd").is_err());
    assert!(read(dir.path(), &outside.path().join(".env").to_string_lossy()).is_err());
    assert!(read(dir.path(), "sub/.env").is_ok());
    #[cfg(unix)]
    {
        std::os::unix::fs::symlink(outside.path().join(".env"), dir.path().join(".env.stolen"))
            .unwrap();
        assert!(read(dir.path(), ".env.stolen").is_err());
        assert!(set(dir.path(), ".env.stolen", "A", "x", "00").is_err());
        std::os::unix::fs::symlink(outside.path(), dir.path().join("linked")).unwrap();
        assert!(read(dir.path(), "linked/.env").is_err());
    }
}

#[test]
fn an_oversized_or_binary_file_is_not_opened() {
    let big = "A=1\n".repeat(100_000);
    let dir = project(&[(".env", &big)]);
    assert!(read(dir.path(), ".env").is_err());
    std::fs::write(dir.path().join(".env.bin"), b"A=\0\xff").unwrap();
    assert!(read(dir.path(), ".env.bin").is_err());
}
