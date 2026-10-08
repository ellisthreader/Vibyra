//! First-run reliability: install detection, wrapped scripts, project kinds and
//! the install-then-serve runtime.

use std::fs;
use std::path::Path;

use tempfile::tempdir;

use super::types::ProjectKind;
use super::{inspect_project, PreviewInspection};

fn project(files: &[(&str, &str)]) -> (tempfile::TempDir, PreviewInspection) {
    let dir = tempdir().unwrap();
    for (name, body) in files {
        let path = dir.path().join(name);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, body).unwrap();
    }
    let inspection = inspect_project(dir.path().to_str().unwrap()).unwrap();
    (dir, inspection)
}

const VITE: &str = r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"1"}}"#;

#[test]
fn a_fresh_clone_installs_before_it_runs_and_says_so() {
    let (_dir, inspection) = project(&[("package.json", VITE)]);
    let target = &inspection.targets[0];
    let info = &inspection.info[&target.id];
    assert!(target.runnable);
    assert!(info.needs_install);
    assert_eq!(
        info.install_command.as_deref(),
        Some("npm install --no-audit --no-fund")
    );
}

#[test]
fn installed_dependencies_are_not_installed_again() {
    let (_dir, inspection) = project(&[("package.json", VITE), ("node_modules/.bin/vite", "")]);
    assert!(inspection.targets[0].runnable);
    assert!(
        inspection.info.is_empty(),
        "nothing to say about a ready website"
    );
}

#[test]
fn a_workspace_lockfile_picks_the_manager_for_a_nested_app() {
    let (dir, inspection) = project(&[("pnpm-lock.yaml", ""), ("apps/web/package.json", VITE)]);
    let target = inspection
        .targets
        .iter()
        .find(|t| t.relative_root == "apps/web")
        .unwrap();
    assert!(target
        .command
        .as_deref()
        .unwrap()
        .starts_with("pnpm run dev"));
    assert!(inspection.info[&target.id]
        .install_command
        .as_deref()
        .unwrap()
        .starts_with("pnpm install"));
    let _ = dir;
}

#[test]
fn steps_before_the_server_are_allowed() {
    let (_dir, inspection) = project(&[(
        "package.json",
        r#"{"scripts":{"dev":"prisma generate && next dev"},"dependencies":{"next":"1"}}"#,
    )]);
    let target = &inspection.targets[0];
    assert!(target.runnable, "{:?}", target.reason);
    assert_eq!(
        target.command.as_deref(),
        Some("npm run dev -- --hostname 127.0.0.1 --port <available>")
    );
}

#[test]
fn env_wrappers_are_allowed() {
    let (_dir, inspection) = project(&[(
        "package.json",
        r#"{"scripts":{"dev":"cross-env NODE_ENV=development vite"},"devDependencies":{"vite":"1"}}"#,
    )]);
    assert!(inspection.targets[0].runnable);
}

#[test]
fn a_process_manager_script_runs_the_framework_directly_when_its_config_exists() {
    let files = [
        (
            "package.json",
            r#"{"scripts":{"dev":"concurrently \"vite\" \"tsc -w\""},"devDependencies":{"vite":"1"}}"#,
        ),
        ("vite.config.ts", "export default {}"),
    ];
    let (_dir, inspection) = project(&files);
    let target = &inspection.targets[0];
    assert!(target.runnable, "{:?}", target.reason);
    assert_eq!(
        target.command.as_deref(),
        Some("npm exec -- vite --host 127.0.0.1 --port <available> --strictPort")
    );
}

#[test]
fn a_process_manager_script_without_framework_config_says_what_to_change() {
    let (_dir, inspection) = project(&[(
        "package.json",
        r#"{"scripts":{"dev":"concurrently \"vite\" \"tsc -w\""},"devDependencies":{"vite":"1"}}"#,
    )]);
    let target = &inspection.targets[0];
    assert!(!target.runnable);
    assert!(target
        .reason
        .as_deref()
        .unwrap()
        .contains("starts several processes through `concurrently`"));
}

#[test]
fn mobile_and_api_projects_say_what_they_are() {
    let (_dir, inspection) = project(&[(
        "package.json",
        r#"{"scripts":{"web":"expo start --web"},"dependencies":{"expo":"1","react-native":"1"}}"#,
    )]);
    assert_eq!(
        inspection.info[&inspection.targets[0].id].project,
        ProjectKind::Mobile
    );

    let (_dir, inspection) = project(&[(
        "package.json",
        r#"{"scripts":{"start":"node server.js"},"dependencies":{"express":"4"}}"#,
    )]);
    let target = &inspection.targets[0];
    assert!(target.runnable);
    assert_eq!(target.framework, "Node server");
    assert_eq!(inspection.info[&target.id].project, ProjectKind::Api);
    assert!(target
        .command
        .as_deref()
        .unwrap()
        .starts_with("PORT=<available> HOST=127.0.0.1 npm run start"));
}

#[test]
fn a_bare_react_native_app_explains_why_it_cannot_preview() {
    let (_dir, inspection) = project(&[(
        "package.json",
        r#"{"scripts":{"start":"react-native start"},"dependencies":{"react-native":"0.74"}}"#,
    )]);
    let target = &inspection.targets[0];
    assert!(!target.runnable);
    assert_eq!(target.framework, "React Native app");
}

#[test]
fn apps_in_unconventional_folders_are_found() {
    let (_dir, inspection) = project(&[("services/dashboard/package.json", VITE)]);
    assert!(inspection
        .targets
        .iter()
        .any(|t| t.relative_root == "services/dashboard" && t.runnable));
}

#[test]
fn a_stray_index_html_in_a_deep_folder_is_not_a_project() {
    let (_dir, inspection) = project(&[
        ("docs/examples/index.html", "<h1>x</h1>"),
        ("docs/examples/package.json", "{}"),
    ]);
    assert!(inspection.targets.iter().all(|t| !t.runnable));
    let _ = Path::new(".");
}
