use std::path::Path;

use serde_json::Value;

use crate::{CoreError, CoreResult};

use super::bounded_text::read_manifest;
use super::package_command::matches_framework_script;
use super::package_profile::{
    dependency_names, framework_name, manager_args, native_only, package_manager, safe_script,
    select_script, string_map,
};
use super::package_runtime::{append_runtime_args, device_hint};
use super::package_script::script_launches_framework;
use super::process::preview_command;
use super::target::{runnable_target, unsupported_target};
use super::types::{DetectedTarget, LaunchRecipe, PreviewDeviceHint, ProcessSpec};

pub(crate) fn detect_package(
    project_root: &Path,
    root: &Path,
    relative: &str,
) -> CoreResult<Option<DetectedTarget>> {
    let Some(text) = read_manifest(&root.join("package.json"), "package.json")? else {
        return Ok(None);
    };
    let value: Value = serde_json::from_str(&text)
        .map_err(|error| CoreError::Preview(format!("invalid package.json: {error}")))?;
    let scripts = string_map(value.get("scripts"));
    let deps = dependency_names(&value);
    let framework = framework_name(&deps, &scripts);
    let Some((script, body)) = select_script(framework, &scripts) else {
        if native_only(&deps, root) {
            return Ok(Some(unsupported_target(
                relative,
                "Native desktop app",
                "Native Electron or Tauri APIs cannot run inside a browser preview.",
            )));
        }
        return Ok(None);
    };
    if !safe_script(body) {
        return Ok(Some(unsupported_target(
            relative,
            framework,
            "The detected script chains shell commands, so Preview will not run it automatically.",
        )));
    }
    if !script_launches_framework(project_root, root, framework, body, &scripts) {
        return Ok(Some(unsupported_target(
            relative,
            framework,
            "The detected script or local wrapper could not be verified as a browser framework launch.",
        )));
    }

    let manager = package_manager(root);
    let mut args = manager_args(manager, script);
    let mut env = Vec::new();
    append_runtime_args(framework, body, &mut args, &mut env);
    let process = ProcessSpec {
        label: framework.into(),
        program: manager.into(),
        args,
        env,
        cwd: root.to_owned(),
    };
    let display = preview_command(&process);
    let hint = device_hint(&deps, framework);
    let landscape = matches!(hint, PreviewDeviceHint::Desktop | PreviewDeviceHint::Tv);
    Ok(Some(runnable_target(
        relative,
        &framework.to_ascii_lowercase().replace(' ', "-"),
        framework,
        hint,
        landscape,
        display,
        LaunchRecipe::Processes {
            processes: vec![process],
            primary_index: 0,
        },
    )))
}

pub(crate) fn vite_companion(root: &Path) -> CoreResult<Option<ProcessSpec>> {
    let Some(text) = read_manifest(&root.join("package.json"), "package.json")? else {
        return Ok(None);
    };
    let Ok(value) = serde_json::from_str::<serde_json::Value>(&text) else {
        return Ok(None);
    };
    let scripts = string_map(value.get("scripts"));
    let Some(body) = scripts.get("dev") else {
        return Ok(None);
    };
    if !safe_script(body) || !matches_framework_script("Vite", body) {
        return Ok(None);
    }
    let manager = package_manager(root);
    let mut args = manager_args(manager, "dev");
    args.extend([
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        "{port}".into(),
    ]);
    Ok(Some(ProcessSpec {
        label: "Vite".into(),
        program: manager.into(),
        args,
        env: Vec::new(),
        cwd: root.to_owned(),
    }))
}
