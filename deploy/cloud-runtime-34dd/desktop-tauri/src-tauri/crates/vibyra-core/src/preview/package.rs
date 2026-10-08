use std::path::Path;

use serde_json::Value;

use crate::{CoreError, CoreResult};

use super::bounded_text::read_manifest;
use super::install::{missing_node_modules, node_install, resolve_manager};
use super::package_direct::{direct_spec, framework_tool, node_server};
use super::package_profile::{
    append_runtime_args, dependency_names, device_hint, framework_name, is_wrapper, last_segment,
    manager_args, matches_framework_script, native_only, safe_script, select_script, string_map,
};
use super::process::preview_command;
use super::target::{runnable_target, unsupported_target};
use super::types::{
    DetectedTarget, LaunchRecipe, PreviewDeviceHint, ProcessSpec, ProjectKind, TargetInfo,
};

pub(crate) fn detect_package(
    root: &Path,
    project: &Path,
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
    let (manager, workspace) = resolve_manager(
        root,
        project,
        value.get("packageManager").and_then(Value::as_str),
    );
    let place = Place {
        root,
        project,
        relative,
        manager,
        workspace,
    };
    let mobile = framework == "Expo web" || deps.contains("react-native");
    let Some((script, body)) = select_script(framework, &scripts) else {
        if native_only(&deps, root) {
            return Ok(Some(unsupported_target(
                relative,
                "Native desktop app",
                "Native Electron or Tauri APIs cannot run inside a browser preview.",
            )));
        }
        if let Some(script) = node_server(&deps, &scripts) {
            let process = ProcessSpec {
                label: "Node server".into(),
                program: manager.into(),
                args: manager_args(manager, script),
                env: vec![
                    ("PORT".into(), "{port}".into()),
                    ("HOST".into(), "127.0.0.1".into()),
                ],
                cwd: root.to_owned(),
            };
            let target = launch_target(&place, "Node server", process, &deps, ProjectKind::Api);
            return Ok(Some(target));
        }
        if mobile {
            return Ok(Some(unsupported_target(
                relative,
                "React Native app",
                "This is a native React Native app with no web build. Preview shows Expo web \
                 builds: add Expo web support (react-native-web) or run it in a simulator.",
            )));
        }
        return Ok(None);
    };

    let scripted = safe_script(body) && matches_framework_script(framework, body);
    let process = if scripted {
        let mut args = manager_args(manager, script);
        let mut env = Vec::new();
        append_runtime_args(framework, body, &mut args, &mut env);
        Some(ProcessSpec {
            label: framework.into(),
            program: manager.into(),
            args,
            env,
            cwd: root.to_owned(),
        })
    } else {
        direct_spec(manager, framework, root)
    };
    let Some(process) = process else {
        return Ok(Some(unsupported_target(
            relative,
            framework,
            &refusal(script, body, framework),
        )));
    };
    let kind = if mobile {
        ProjectKind::Mobile
    } else {
        ProjectKind::Website
    };
    Ok(Some(launch_target(&place, framework, process, &deps, kind)))
}

/// Why a script is not run, naming the script so the owner knows what to change.
fn refusal(script: &str, body: &str, framework: &str) -> String {
    if !safe_script(body) {
        format!("The \"{script}\" script chains shell commands with pipes, background jobs or redirects, so Preview will not run it automatically.")
    } else if is_wrapper(body) {
        format!("The \"{script}\" script starts several processes through `{}`; Preview needs a script that starts only the {framework} dev server.", last_segment(body).split_whitespace().next().unwrap_or(""))
    } else {
        format!("The \"{script}\" script does not directly launch the recognized browser framework ({framework}); its last command is `{}`.", last_segment(body))
    }
}

/// Where an app is: its folder, its project, and how its packages are managed.
struct Place<'a> {
    root: &'a Path,
    project: &'a Path,
    relative: &'a str,
    manager: &'a str,
    /// Where the install runs: the folder holding the lockfile.
    workspace: std::path::PathBuf,
}

/// A runnable target, with the install Run performs first if dependencies are missing.
fn launch_target(
    place: &Place,
    framework: &str,
    process: ProcessSpec,
    deps: &std::collections::HashSet<String>,
    kind: ProjectKind,
) -> DetectedTarget {
    let Place {
        root,
        project,
        relative,
        manager,
        workspace,
    } = place;
    let tool = framework_tool(framework);
    let install = missing_node_modules(root, project, tool, !deps.is_empty())
        .then(|| node_install(manager, workspace));
    let display = preview_command(&process);
    let hint = device_hint(deps, framework);
    let landscape = matches!(hint, PreviewDeviceHint::Desktop | PreviewDeviceHint::Tv);
    let mut target = runnable_target(
        relative,
        &framework.to_ascii_lowercase().replace(' ', "-"),
        framework,
        hint,
        landscape,
        display,
        LaunchRecipe::Processes {
            processes: vec![process],
            primary_index: 0,
            install: install.clone().into_iter().collect(),
        },
    );
    target.info = TargetInfo {
        project: kind,
        needs_install: install.is_some(),
        install_command: install.as_ref().map(preview_command),
    };
    target
}
