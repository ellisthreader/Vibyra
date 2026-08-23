use std::fs;

use tempfile::tempdir;

use super::inspect_project;
use super::types::PreviewDeviceHint;

fn package(root: &std::path::Path, value: &str) {
    fs::create_dir_all(root).unwrap();
    fs::write(root.join("package.json"), value).unwrap();
}

#[test]
fn verifies_a_bounded_local_expo_wrapper_inside_the_project() {
    let dir = tempdir().unwrap();
    let mobile = dir.path().join("mobile");
    package(
        &mobile,
        r#"{"scripts":{"web":"node ../scripts/mobile-dev.mjs --web"},"dependencies":{"expo":"1"}}"#,
    );
    fs::create_dir(dir.path().join("scripts")).unwrap();
    fs::write(
        dir.path().join("scripts/mobile-dev.mjs"),
        r#"
          import { spawn } from 'node:child_process';
          import path from 'node:path';
          const expoCli = path.join('node_modules', 'expo', 'bin', 'cli');
          spawn(process.execPath, [expoCli, 'start', ...process.argv.slice(2)]);
        "#,
    )
    .unwrap();

    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    let target = inspection
        .targets
        .iter()
        .find(|target| target.relative_root == "mobile")
        .unwrap();
    assert!(target.runnable);
    assert_eq!(target.framework, "Expo web");
    assert_eq!(
        target.command.as_deref(),
        Some("npm run web -- --host localhost --port <available>")
    );
}

#[test]
fn rejects_unverified_or_out_of_project_expo_wrappers() {
    let dir = tempdir().unwrap();
    let project = dir.path().join("project");
    let mobile = project.join("mobile");
    package(
        &mobile,
        r#"{"scripts":{"web":"node ../../outside.mjs --web"},"dependencies":{"expo":"1"}}"#,
    );
    fs::write(
        dir.path().join("outside.mjs"),
        "spawn('expo', ['start', ...process.argv.slice(2)])",
    )
    .unwrap();

    let target = inspect_project(project.to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);
    assert!(!target.runnable);
    assert!(target.reason.unwrap().contains("could not be verified"));
}

#[test]
fn resolves_safe_package_aliases_to_expo() {
    let dir = tempdir().unwrap();
    package(
        dir.path(),
        r#"{"scripts":{"web":"npm run start -- --web","start":"expo start"},"dependencies":{"expo":"1"}}"#,
    );
    let target = inspect_project(dir.path().to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);

    assert!(target.runnable);
    assert_eq!(
        target.command.as_deref(),
        Some("npm run web -- --host localhost --port <available>")
    );
}

#[test]
fn expo_go_and_development_build_scripts_gain_a_web_target() {
    for (script_name, body) in [
        ("start", "expo start --go"),
        ("start:dev-client", "expo start --dev-client"),
    ] {
        let dir = tempdir().unwrap();
        package(
            dir.path(),
            &format!(r#"{{"scripts":{{"{script_name}":"{body}"}},"dependencies":{{"expo":"1"}}}}"#),
        );
        let target = inspect_project(dir.path().to_str().unwrap())
            .unwrap()
            .targets
            .remove(0);
        let command = target.command.unwrap();
        assert!(target.runnable);
        assert!(command.contains(&format!("npm run {script_name}")));
        assert!(command.contains("--web --host localhost --port <available>"));
    }
}

#[test]
fn mobile_web_toolchains_use_phone_viewports() {
    let cases = [
        (
            r#"{"scripts":{"dev":"ionic serve"},"dependencies":{"@ionic/react":"1"}}"#,
            "Ionic web",
            "--no-open",
        ),
        (
            r#"{"scripts":{"dev":"vite"},"dependencies":{"vite":"1","@capacitor/core":"1"}}"#,
            "Vite",
            "--port <available>",
        ),
        (
            r#"{"scripts":{"web":"webpack serve"},"dependencies":{"react-native-web":"1","webpack-dev-server":"1"}}"#,
            "Webpack",
            "--port <available>",
        ),
    ];
    for (manifest, framework, command_marker) in cases {
        let dir = tempdir().unwrap();
        package(dir.path(), manifest);
        let target = inspect_project(dir.path().to_str().unwrap())
            .unwrap()
            .targets
            .remove(0);
        assert!(target.runnable);
        assert_eq!(target.framework, framework);
        assert_eq!(target.device_hint, PreviewDeviceHint::Phone);
        assert!(target.command.unwrap().contains(command_marker));
    }
}

#[test]
fn native_only_react_native_is_not_misrepresented_as_a_browser_preview() {
    let dir = tempdir().unwrap();
    package(
        dir.path(),
        r#"{"scripts":{"start":"react-native start"},"dependencies":{"react-native":"1"}}"#,
    );
    let target = inspect_project(dir.path().to_str().unwrap())
        .unwrap()
        .targets
        .remove(0);
    assert!(!target.runnable);
    assert_eq!(target.framework, "No browser preview");
}
