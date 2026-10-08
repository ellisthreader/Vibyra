//! Desktop apps a project can run as a window on the computer: Tauri and
//! Electron scripts, other scripts that `cargo run` an app, and Cargo GUI
//! crates without a package.json.

use std::path::Path;

use serde_json::Value;

use crate::{CoreError, CoreResult};

use super::bounded_text::read_manifest;
use super::desktop_script::{classify, desktop_script_ok, rank};
use super::package_profile::{dependency_names, package_manager, string_map};
use super::process::preview_command;
use super::target::desktop_target;
use super::types::{DetectedTarget, LaunchRecipe, ProcessSpec};

/// A project rarely has more than one app worth running; a few alternatives
/// (Tauri and Electron shells of one app) are offered, never a list of every
/// script.
const MAX_PER_APP: usize = 3;

const GUI_CRATES: [&str; 10] = [
    "tauri", "eframe", "egui", "iced", "winit", "slint", "gtk4", "fltk", "druid", "bevy",
];

pub(crate) fn detect_desktop(app: &Path, relative: &str) -> CoreResult<Vec<DetectedTarget>> {
    let Some(text) = read_manifest(&app.join("package.json"), "package.json")? else {
        return cargo_app(app, relative);
    };
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| CoreError::Preview(format!("invalid package.json: {error}")))?;
    let scripts = string_map(value.get("scripts"));
    let manager = package_manager(app);
    let mut found = scripts
        .iter()
        .filter(|(_, body)| desktop_script_ok(body))
        .filter_map(|(name, body)| classify(name, body).map(|framework| (framework, name)))
        .collect::<Vec<_>>();
    found.sort_by_key(|(framework, name)| rank(framework, name));
    let mut targets = found
        .into_iter()
        .take(MAX_PER_APP)
        .map(|(framework, name)| {
            let args = run_args(manager, name);
            script_target(app, relative, (framework, name), manager, args)
        })
        .collect::<Vec<_>>();
    if targets.is_empty() {
        let deps = dependency_names(&value);
        if deps.contains("@tauri-apps/cli") && has_tauri_config(app) {
            let (program, args) = exec_args(manager, &["tauri", "dev"]);
            targets.push(script_target(
                app,
                relative,
                ("Tauri", "tauri dev"),
                program,
                args,
            ));
        }
    }
    Ok(targets)
}

fn script_target(
    app: &Path,
    relative: &str,
    (framework, script): (&str, &str),
    program: &str,
    args: Vec<String>,
) -> DetectedTarget {
    let process = ProcessSpec {
        label: framework.into(),
        program: program.into(),
        args,
        env: Vec::new(),
        cwd: app.to_owned(),
    };
    let command = preview_command(&process);
    desktop_target(
        relative,
        &format!("desktop-{}", slug(script)),
        &format!("{framework} ({script})"),
        command,
        LaunchRecipe::Desktop { process },
    )
}

/// A Rust GUI crate with no package.json runs with `cargo run`.
fn cargo_app(app: &Path, relative: &str) -> CoreResult<Vec<DetectedTarget>> {
    let Some(text) = read_manifest(&app.join("Cargo.toml"), "Cargo.toml")? else {
        return Ok(Vec::new());
    };
    let gui = text.lines().any(|line| {
        let name = line.split(['=', '.']).next().unwrap_or("").trim();
        GUI_CRATES.contains(&name)
    });
    if !gui || !app.join("src/main.rs").is_file() {
        return Ok(Vec::new());
    }
    let process = ProcessSpec {
        label: "Rust app".into(),
        program: "cargo".into(),
        args: vec!["run".into()],
        env: Vec::new(),
        cwd: app.to_owned(),
    };
    let command = preview_command(&process);
    Ok(vec![desktop_target(
        relative,
        "desktop-cargo-run",
        "Rust app",
        command,
        LaunchRecipe::Desktop { process },
    )])
}

pub(crate) fn run_args(manager: &str, script: &str) -> Vec<String> {
    if manager == "yarn" {
        vec![script.into()]
    } else {
        vec!["run".into(), script.into()]
    }
}

/// Runs a CLI from the project's own dependencies.
pub(crate) fn exec_args<'a>(manager: &'a str, tool: &[&str]) -> (&'a str, Vec<String>) {
    let (program, prefix): (&str, &[&str]) = match manager {
        "yarn" => ("yarn", &[]),
        "bun" => ("bunx", &[]),
        "npm" => ("npm", &["exec", "--"]),
        _ => (manager, &["exec"]),
    };
    let args = prefix.iter().chain(tool).map(|part| (*part).to_owned());
    (program, args.collect())
}

fn has_tauri_config(app: &Path) -> bool {
    ["tauri.conf.json", "tauri.conf.json5", "Tauri.toml"]
        .iter()
        .any(|file| app.join("src-tauri").join(file).is_file() || app.join(file).is_file())
}

fn slug(script: &str) -> String {
    script
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect()
}
