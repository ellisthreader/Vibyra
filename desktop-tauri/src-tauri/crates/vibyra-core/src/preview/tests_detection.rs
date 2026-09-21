use super::{inspect_project, package_profile::manager_args};
use std::fs;
use tempfile::tempdir;

#[test]
fn selects_a_valid_web_script_after_an_unsuitable_dev_script() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"dev":"node tools.js","web":"vite"},"dependencies":{"vite":"1"}}"#,
    )
    .unwrap();
    let result = inspect_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result.targets[0].runnable);
    assert!(result.targets[0]
        .command
        .as_ref()
        .unwrap()
        .contains("run web"));
}

#[test]
fn malformed_root_manifest_does_not_hide_a_working_nested_app() {
    let dir = tempdir().unwrap();
    fs::write(dir.path().join("package.json"), "{broken").unwrap();
    fs::create_dir(dir.path().join("web")).unwrap();
    fs::write(dir.path().join("web/index.html"), "<h1>Working</h1>").unwrap();
    let result = inspect_project(dir.path().to_str().unwrap()).unwrap();
    assert!(result
        .targets
        .iter()
        .any(|t| !t.runnable && t.reason.as_ref().unwrap().contains("package.json")));
    assert!(result
        .targets
        .iter()
        .any(|t| t.runnable && t.relative_root == "web"));
}

#[test]
fn only_npm_needs_an_argument_separator() {
    assert_eq!(manager_args("npm", "dev"), ["run", "dev", "--"]);
    assert_eq!(manager_args("pnpm", "dev"), ["run", "dev"]);
    assert_eq!(manager_args("bun", "dev"), ["run", "dev"]);
    assert_eq!(manager_args("yarn", "dev"), ["dev"]);
}
