//! How a detected package script is run: package manager, arguments, hints.

use std::collections::HashSet;
use std::path::Path;

use super::types::PreviewDeviceHint;

pub(crate) fn package_manager(root: &Path) -> &'static str {
    if root.join("pnpm-lock.yaml").is_file() {
        "pnpm"
    } else if root.join("yarn.lock").is_file() {
        "yarn"
    } else if root.join("bun.lockb").is_file() || root.join("bun.lock").is_file() {
        "bun"
    } else {
        "npm"
    }
}

pub(crate) fn manager_args(manager: &str, script: &str) -> Vec<String> {
    if manager == "yarn" {
        vec![script.into()]
    } else if manager == "npm" {
        vec!["run".into(), script.into(), "--".into()]
    } else {
        vec!["run".into(), script.into()]
    }
}

pub(crate) fn append_runtime_args(
    framework: &str,
    body: &str,
    args: &mut Vec<String>,
    env: &mut Vec<(String, String)>,
) {
    if framework == "React" {
        env.extend([
            ("HOST".into(), "127.0.0.1".into()),
            ("PORT".into(), "{port}".into()),
        ]);
    } else if framework == "Gatsby" {
        args.extend([
            "-H".into(),
            "127.0.0.1".into(),
            "-p".into(),
            "{port}".into(),
        ]);
    } else if framework == "Eleventy" {
        args.extend(["--port".into(), "{port}".into()]);
    } else if framework == "Next.js" {
        args.extend([
            "--hostname".into(),
            "127.0.0.1".into(),
            "--port".into(),
            "{port}".into(),
        ]);
    } else {
        if framework == "Expo web" && !body.contains("--web") {
            args.push("--web".into());
        }
        let host = if framework == "Expo web" {
            "localhost"
        } else {
            "127.0.0.1"
        };
        args.extend([
            "--host".into(),
            host.into(),
            "--port".into(),
            "{port}".into(),
        ]);
        // Without it Vite quietly moves to another port and readiness never sees it.
        if matches!(framework, "Vite" | "SvelteKit") {
            args.push("--strictPort".into());
        }
    }
}

pub(crate) fn device_hint(deps: &HashSet<String>, framework: &str) -> PreviewDeviceHint {
    if framework == "Expo web" || deps.contains("react-native") {
        PreviewDeviceHint::Phone
    } else if ["three", "phaser", "@babylonjs/core"]
        .iter()
        .any(|dep| deps.contains(*dep))
    {
        PreviewDeviceHint::Tv
    } else {
        PreviewDeviceHint::Laptop
    }
}
