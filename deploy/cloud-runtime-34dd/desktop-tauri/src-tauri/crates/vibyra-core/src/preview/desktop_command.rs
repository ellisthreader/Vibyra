//! Commands an agent or the phone proposes for running a project's desktop
//! app. They are argv, never shell text: each argument is checked, the shape
//! must be a package script or a known app launcher, and every path stays
//! inside the project.

use std::fs;
use std::path::{Component, Path, PathBuf};

use serde_json::Value;

use crate::{CoreError, CoreResult};

use super::bounded_text::read_manifest;
use super::desktop_script::desktop_script_ok;
use super::package_profile::{dependency_names, string_map};
use super::process::preview_command;
use super::target::desktop_target;
use super::types::{DesktopCommand, DetectedTarget, LaunchRecipe, ProcessSpec};

const MAX_ARGS: usize = 16;
/// What a phone can show in full before the owner approves it.
const MAX_TEXT: usize = 300;

/// Splits a proposed command on whitespace. Quotes are not interpreted: an
/// argument that needs them is refused rather than guessed at.
pub fn parse_desktop_command(relative_root: &str, text: &str) -> CoreResult<DesktopCommand> {
    if text.len() > MAX_TEXT {
        return Err(refuse("Keep the command under 300 characters."));
    }
    let argv = text
        .split_whitespace()
        .map(str::to_owned)
        .collect::<Vec<_>>();
    let command = DesktopCommand {
        relative_root: relative_root.trim().trim_matches('/').to_owned(),
        argv,
    };
    check_args(&command.argv)?;
    Ok(command)
}

pub(crate) fn custom_target(
    project: &Path,
    command: &DesktopCommand,
) -> CoreResult<DetectedTarget> {
    check_args(&command.argv)?;
    if command.argv.join(" ").len() > MAX_TEXT {
        return Err(refuse("Keep the command under 300 characters."));
    }
    let cwd = inside(project, project, &command.relative_root)?;
    check_shape(project, &cwd, &command.argv)?;
    let process = ProcessSpec {
        label: "App".into(),
        program: command.argv[0].clone(),
        args: command.argv[1..].to_vec(),
        env: Vec::new(),
        cwd: cwd.clone(),
    };
    let relative = super::target::relative_label(project, &cwd);
    let display = preview_command(&process);
    Ok(desktop_target(
        &relative,
        &format!("desktop-cmd-{:016x}", fnv(&command.argv.join("\u{1f}"))),
        // Short on purpose: the exact command is shown beside it.
        "Custom command",
        display,
        LaunchRecipe::Desktop { process },
    ))
}

fn check_args(argv: &[String]) -> CoreResult<()> {
    if argv.is_empty() || argv.len() > MAX_ARGS {
        return Err(refuse(
            "Give the command as a program and up to 15 arguments.",
        ));
    }
    for arg in argv {
        let allowed = |c: char| c.is_ascii_alphanumeric() || "._:/@=+,-".contains(c);
        if arg.len() > 200 || !arg.chars().all(allowed) {
            return Err(refuse(&format!(
                "\"{arg}\" contains characters Vibyra will not run."
            )));
        }
        if arg.starts_with('/')
            || Path::new(arg)
                .components()
                .any(|c| c == Component::ParentDir)
        {
            return Err(refuse("Paths must stay inside the project."));
        }
    }
    Ok(())
}

fn check_shape(project: &Path, cwd: &Path, argv: &[String]) -> CoreResult<()> {
    let args = argv.iter().map(String::as_str).collect::<Vec<_>>();
    let deps = || {
        package(cwd)
            .map(|value| dependency_names(&value))
            .unwrap_or_default()
    };
    match args.as_slice() {
        ["npm" | "pnpm" | "bun", "run", script, rest @ ..] | ["yarn", "run", script, rest @ ..]
            if rest.first().is_none_or(|first| *first == "--") =>
        {
            script_ok(cwd, script)
        }
        ["yarn", script, rest @ ..] if rest.first().is_none_or(|first| *first == "--") => {
            script_ok(cwd, script)
        }
        ["cargo", "run", flags @ ..] | ["cargo", "tauri", "dev", flags @ ..] => {
            manifest_ok(project, cwd, flags)
        }
        ["npx" | "bunx", "tauri", "dev", ..]
        | ["npm", "exec", "--", "tauri", "dev", ..]
        | ["pnpm", "exec", "tauri", "dev", ..]
            if deps().contains("@tauri-apps/cli") =>
        {
            Ok(())
        }
        ["npx" | "bunx", "electron", path, ..] if deps().contains("electron") => {
            inside(project, cwd, path).map(|_| ())
        }
        _ => Err(refuse(
            "Vibyra runs a package script, cargo run, cargo tauri dev, tauri dev or electron.",
        )),
    }
}

fn script_ok(cwd: &Path, script: &str) -> CoreResult<()> {
    let scripts = package(cwd).map(|value| string_map(value.get("scripts")));
    match scripts.as_ref().and_then(|scripts| scripts.get(script)) {
        Some(body) if desktop_script_ok(body) => Ok(()),
        Some(_) => Err(refuse(&format!(
            "The \"{script}\" script uses shell syntax other than &&, so Vibyra will not run it."
        ))),
        None => Err(refuse(&format!("package.json has no \"{script}\" script."))),
    }
}

fn manifest_ok(project: &Path, cwd: &Path, flags: &[&str]) -> CoreResult<()> {
    let explicit = flags
        .iter()
        .position(|flag| *flag == "--manifest-path")
        .map(|index| flags.get(index + 1).copied().unwrap_or(""));
    let manifest = match explicit {
        Some(path) => inside(project, cwd, path)?,
        None => cwd.join("Cargo.toml"),
    };
    if flags
        .iter()
        .any(|flag| flag.starts_with("--manifest-path="))
    {
        return Err(refuse(
            "Write --manifest-path and its path as two arguments.",
        ));
    }
    if manifest.is_file() {
        Ok(())
    } else {
        Err(refuse("There is no Cargo.toml for cargo to run."))
    }
}

/// Resolves `path` from `base`, refusing anything that leaves the project,
/// including through a symlink.
fn inside(project: &Path, base: &Path, path: &str) -> CoreResult<PathBuf> {
    let joined = if path.is_empty() || path == "." {
        base.to_owned()
    } else {
        base.join(path)
    };
    let resolved = fs::canonicalize(&joined).map_err(|_| {
        refuse(&format!(
            "{} does not exist in the project.",
            joined.display()
        ))
    })?;
    if resolved.starts_with(project) {
        Ok(resolved)
    } else {
        Err(refuse("Paths must stay inside the project."))
    }
}

fn package(cwd: &Path) -> Option<Value> {
    let text = read_manifest(&cwd.join("package.json"), "package.json").ok()??;
    serde_json::from_str(&text).ok()
}

fn refuse(message: &str) -> CoreError {
    CoreError::Preview(message.into())
}

/// Stable across runs and builds, unlike the standard library's hasher.
fn fnv(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(0x0100_0000_01b3)
    })
}
