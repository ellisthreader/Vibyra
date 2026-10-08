use super::allow::{is_allowed, refuses, set_allowed, FILE, MAX_ROOTS};

fn project() -> (tempfile::TempDir, tempfile::TempDir) {
    (tempfile::tempdir().unwrap(), tempfile::tempdir().unwrap())
}

#[test]
fn nothing_is_allowed_until_the_person_says_so() {
    let (settings, project) = project();
    let root = project.path().to_str().unwrap();
    assert!(!is_allowed(settings.path(), root));
    assert!(refuses(settings.path(), root, ".env"));
    assert!(refuses(settings.path(), root, "deploy/id_rsa"));
    assert!(!refuses(settings.path(), root, "src/main.rs"));
}

#[test]
fn an_allowed_project_permits_its_sensitive_files() {
    let (settings, project) = project();
    let root = project.path().to_str().unwrap();
    set_allowed(settings.path(), root, true).unwrap();
    assert!(is_allowed(settings.path(), root));
    assert!(!refuses(settings.path(), root, ".env"));
    let other = tempfile::tempdir().unwrap();
    assert!(refuses(
        settings.path(),
        other.path().to_str().unwrap(),
        ".env"
    ));
    set_allowed(settings.path(), root, false).unwrap();
    assert!(refuses(settings.path(), root, ".env"));
}

#[test]
fn a_root_is_matched_by_its_canonical_path() {
    let (settings, project) = project();
    let root = project.path().to_str().unwrap();
    set_allowed(settings.path(), root, true).unwrap();
    let dotted = format!("{root}/./");
    assert!(is_allowed(settings.path(), &dotted));
}

#[test]
fn allowing_twice_stores_one_root_and_the_list_is_bounded() {
    let (settings, project) = project();
    let root = project.path().to_str().unwrap();
    set_allowed(settings.path(), root, true).unwrap();
    set_allowed(settings.path(), root, true).unwrap();
    let raw = std::fs::read_to_string(settings.path().join(FILE)).unwrap();
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&raw).unwrap()["allow"]
            .as_array()
            .unwrap()
            .len(),
        1
    );
    for i in 0..MAX_ROOTS {
        let _ = set_allowed(settings.path(), &format!("/nowhere/{i}"), true);
    }
    assert!(set_allowed(settings.path(), "/nowhere/one-too-many", true).is_err());
    assert!(set_allowed(settings.path(), &format!("/{}", "a".repeat(1100)), true).is_err());
}

#[test]
fn a_damaged_file_allows_nothing() {
    let (settings, project) = project();
    std::fs::write(settings.path().join(FILE), "{not json").unwrap();
    assert!(!is_allowed(
        settings.path(),
        project.path().to_str().unwrap()
    ));
}
