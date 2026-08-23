use std::fs;

use tempfile::tempdir;

use super::inspect_project;
use super::process::reserve_port;

#[test]
fn detects_a_safe_vite_script() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"1"}}"#,
    )
    .unwrap();
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    let target = &inspection.targets[0];
    assert_eq!(target.framework, "Vite");
    assert!(target.runnable);
    assert!(target.command.as_deref().unwrap().contains("npm run dev"));
}

#[test]
fn detects_expo_in_a_mobile_monorepo_root() {
    let dir = tempdir().unwrap();
    let app = dir.path().join("apps/mobile");
    fs::create_dir_all(&app).unwrap();
    fs::write(
        app.join("package.json"),
        r#"{"scripts":{"web":"expo start --web"},"dependencies":{"expo":"1"}}"#,
    )
    .unwrap();

    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    let target = inspection
        .targets
        .iter()
        .find(|target| target.relative_root == "apps/mobile")
        .unwrap();
    assert_eq!(target.framework, "Expo web");
    assert!(target.runnable);
}

#[test]
fn held_port_reservations_are_unique() {
    let first = reserve_port().unwrap();
    let second = reserve_port().unwrap();
    assert_ne!(first.port, second.port);
}

#[test]
fn reports_the_exact_next_launch_shape_before_approval() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"dev":"next dev"},"dependencies":{"next":"1"}}"#,
    )
    .unwrap();
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    assert_eq!(
        inspection.targets[0].command.as_deref(),
        Some("npm run dev -- --hostname 127.0.0.1 --port <available>")
    );
}

#[test]
fn generic_package_scripts_are_not_started_as_browser_previews() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"start":"node server.js"}}"#,
    )
    .unwrap();
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    assert!(!inspection.targets[0].runnable);
    assert_eq!(inspection.targets[0].framework, "No browser preview");
}

#[test]
fn refuses_shell_chained_project_scripts() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"dev":"vite && curl example.com"},"devDependencies":{"vite":"1"}}"#,
    )
    .unwrap();
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    let target = &inspection.targets[0];
    assert!(!target.runnable);
    assert!(target
        .reason
        .as_deref()
        .unwrap()
        .contains("chains shell commands"));
}

#[test]
fn refuses_background_shell_chains() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"dev":"vite & curl example.com"},"devDependencies":{"vite":"1"}}"#,
    )
    .unwrap();
    let target = inspect_project(dir.path().to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);
    assert!(!target.runnable);
    assert!(target.reason.unwrap().contains("chains shell commands"));
}

#[test]
fn refuses_a_mislabeled_framework_script() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join("package.json"),
        r#"{"scripts":{"dev":"node invite.js"},"devDependencies":{"vite":"1"}}"#,
    )
    .unwrap();
    let target = inspect_project(dir.path().to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);
    assert!(!target.runnable);
    assert!(target.reason.unwrap().contains("could not be verified"));
}
