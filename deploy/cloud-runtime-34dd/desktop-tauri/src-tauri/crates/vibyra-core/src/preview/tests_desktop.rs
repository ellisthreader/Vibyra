use std::fs;
use std::path::Path;

use tempfile::tempdir;

use super::{
    desktop_target_for, inspect_project, inspect_project_with, parse_desktop_command,
    PreviewTargetKind,
};

fn write(root: &Path, file: &str, text: &str) {
    let path = root.join(file);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, text).unwrap();
}

fn root(dir: &tempfile::TempDir) -> String {
    fs::canonicalize(dir.path())
        .unwrap()
        .to_string_lossy()
        .into_owned()
}

/// The HKE layout: a Vite site plus a `rust:dev` script that builds and runs
/// the Tauri till, and an Electron shell.
fn hke(dir: &Path) {
    write(
        dir,
        "package.json",
        r#"{"scripts":{"dev":"vite",
            "rust:dev":"npm run desktop:assets && cargo run --manifest-path software/desktop/Cargo.toml",
            "rust:build":"cargo build --release","electron":"electron .",
            "verify:visual":"electron scripts/visual.mjs"},
            "devDependencies":{"vite":"1","electron":"1"}}"#,
    );
    write(
        dir,
        "software/desktop/Cargo.toml",
        "[package]\nname='hke'\n",
    );
}

#[test]
fn a_project_offers_its_site_and_its_desktop_app() {
    let dir = tempdir().unwrap();
    hke(dir.path());
    let targets = inspect_project(&root(&dir)).unwrap().targets;
    assert_eq!(targets[0].framework, "Vite");
    assert_eq!(targets[0].kind, PreviewTargetKind::Web);
    let desktop = targets
        .iter()
        .filter(|t| t.kind == PreviewTargetKind::Desktop)
        .collect::<Vec<_>>();
    assert_eq!(desktop.len(), 2, "{desktop:#?}");
    assert_eq!(desktop[0].id, ".::desktop-rust-dev");
    assert_eq!(desktop[0].command.as_deref(), Some("npm run rust:dev"));
    assert_eq!(desktop[1].id, ".::desktop-electron");
    assert!(desktop.iter().all(|t| t.runnable));
}

#[test]
fn a_tauri_app_without_a_run_script_uses_its_cli() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        "package.json",
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"1","@tauri-apps/cli":"2"}}"#,
    );
    write(dir.path(), "src-tauri/tauri.conf.json", "{}");
    let targets = inspect_project(&root(&dir)).unwrap().targets;
    let tauri = targets
        .iter()
        .find(|t| t.kind == PreviewTargetKind::Desktop)
        .unwrap();
    assert_eq!(tauri.command.as_deref(), Some("npm exec -- tauri dev"));
}

#[test]
fn a_rust_gui_crate_runs_with_cargo() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        "Cargo.toml",
        "[package]\nname='x'\n[dependencies]\neframe = \"0.29\"\n",
    );
    write(dir.path(), "src/main.rs", "fn main() {}");
    let targets = inspect_project(&root(&dir)).unwrap().targets;
    assert_eq!(targets[0].command.as_deref(), Some("cargo run"));
    assert_eq!(targets[0].kind, PreviewTargetKind::Desktop);
}

#[test]
fn native_only_placeholder_is_replaced_by_the_runnable_app() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        "package.json",
        r#"{"scripts":{"start":"electron ."},"dependencies":{"electron":"1"}}"#,
    );
    let targets = inspect_project(&root(&dir)).unwrap().targets;
    assert_eq!(targets.len(), 1);
    assert!(targets[0].runnable);
    assert_eq!(targets[0].kind, PreviewTargetKind::Desktop);
}

#[test]
fn web_targets_serialize_exactly_as_before_kind_existed() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        "package.json",
        r#"{"scripts":{"dev":"vite"},"devDependencies":{"vite":"1"}}"#,
    );
    let target = &inspect_project(&root(&dir)).unwrap().targets[0];
    // Saved phone grants fingerprint this JSON; a new field would revoke them.
    // (Vite's command gained --strictPort, so Vite grants were re-asked once;
    // project kind and install state live in `PreviewInspection::info` instead.)
    assert_eq!(
        serde_json::to_string(target).unwrap(),
        r#"{"id":".::vite","name":"Vite","framework":"Vite","relativeRoot":".","command":"npm run dev -- --host 127.0.0.1 --port <available> --strictPort","runnable":true,"reason":null,"deviceHint":"laptop","landscape":false}"#
    );
}

#[test]
fn a_proposed_command_matching_a_detected_script_is_that_target() {
    let dir = tempdir().unwrap();
    hke(dir.path());
    let command = parse_desktop_command(".", "npm run rust:dev").unwrap();
    let target = desktop_target_for(&root(&dir), &command).unwrap();
    assert_eq!(target.id, ".::desktop-rust-dev");
}

#[test]
fn an_approved_custom_command_becomes_a_runnable_target() {
    let dir = tempdir().unwrap();
    hke(dir.path());
    let command =
        parse_desktop_command(".", "cargo run --manifest-path software/desktop/Cargo.toml")
            .unwrap();
    let custom = desktop_target_for(&root(&dir), &command).unwrap();
    assert!(custom.id.starts_with(".::desktop-cmd-"));
    let listed = inspect_project_with(&root(&dir), &[command])
        .unwrap()
        .targets;
    assert!(listed.iter().any(|t| t.id == custom.id));
}

#[test]
fn proposed_commands_are_argv_inside_the_project_only() {
    let dir = tempdir().unwrap();
    hke(dir.path());
    let outside = tempdir().unwrap();
    write(outside.path(), "Cargo.toml", "[package]\nname='x'\n");
    #[cfg(unix)]
    std::os::unix::fs::symlink(outside.path(), dir.path().join("escape")).unwrap();
    let rejected = [
        "npm run rust:dev; rm -rf x",
        "npm run 'rust:dev'",
        "npm run rust:dev && echo",
        "cmd /c %PATH%",
        "cargo run --manifest-path ../x/Cargo.toml",
        "cargo run --manifest-path /tmp/Cargo.toml",
        "cargo run --manifest-path=software/desktop/Cargo.toml",
        "npm run missing",
        "sh -c ls",
        "open -a Safari",
        "npx electron ^",
    ];
    for text in rejected {
        let target = parse_desktop_command(".", text)
            .and_then(|command| desktop_target_for(&root(&dir), &command));
        assert!(target.is_err(), "{text:?} was accepted");
    }
    #[cfg(unix)]
    {
        let command = parse_desktop_command("escape", "cargo run").unwrap();
        assert!(desktop_target_for(&root(&dir), &command).is_err());
    }
}
