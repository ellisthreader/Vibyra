use super::*;

fn project(files: &[(&str, &str)]) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    for (name, body) in files {
        std::fs::write(dir.path().join(name), body).unwrap();
    }
    dir
}

#[test]
fn the_node_test_script_runs_through_the_projects_package_manager() {
    let npm = project(&[("package.json", r#"{"scripts":{"test":"vitest"}}"#)]);
    assert_eq!(detect(npm.path()).unwrap().label, "npm run test");
    let pnpm = project(&[
        ("package.json", r#"{"scripts":{"test":"jest"}}"#),
        ("pnpm-lock.yaml", ""),
    ]);
    assert_eq!(detect(pnpm.path()).unwrap().label, "pnpm run test");
    let yarn = project(&[(
        "package.json",
        r#"{"scripts":{"test":"jest"},"packageManager":"yarn@4.1.0"}"#,
    )]);
    let found = detect(yarn.path()).unwrap();
    assert_eq!(
        (found.program.as_str(), found.args),
        ("yarn", vec!["test".to_string()])
    );
}

#[test]
fn the_npm_init_placeholder_is_not_a_test() {
    let dir = project(&[(
        "package.json",
        r#"{"scripts":{"test":"echo \"Error: no test specified\" && exit 1"}}"#,
    )]);
    assert!(detect(dir.path()).is_none());
}

#[test]
fn other_stacks_have_a_conventional_command() {
    assert_eq!(
        detect(project(&[("Cargo.toml", "")]).path()).unwrap().label,
        "cargo test"
    );
    assert_eq!(
        detect(project(&[("go.mod", "")]).path()).unwrap().label,
        "go test ./..."
    );
    let php = project(&[("composer.json", r#"{"scripts":{"test":"phpunit"}}"#)]);
    assert_eq!(detect(php.path()).unwrap().label, "composer run test");
    assert!(detect(project(&[("README.md", "")]).path()).is_none());
}

#[test]
fn a_broken_manifest_is_not_a_panic() {
    assert!(detect(project(&[("package.json", "{nope")]).path()).is_none());
}
