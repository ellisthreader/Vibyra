use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde_json::Value;

use super::types::PreviewDeviceHint;

pub(crate) fn string_map(value: Option<&Value>) -> HashMap<String, String> {
    value
        .and_then(Value::as_object)
        .map(|map| {
            map.iter()
                .filter_map(|(key, value)| value.as_str().map(|text| (key.clone(), text.into())))
                .collect()
        })
        .unwrap_or_default()
}

pub(crate) fn dependency_names(value: &Value) -> HashSet<String> {
    ["dependencies", "devDependencies"]
        .into_iter()
        .filter_map(|key| value.get(key).and_then(Value::as_object))
        .flat_map(|map| map.keys().cloned())
        .collect()
}

pub(crate) fn framework_name(
    deps: &HashSet<String>,
    scripts: &HashMap<String, String>,
) -> &'static str {
    let bodies = scripts
        .values()
        .cloned()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase();
    if deps.contains("expo") || has_marker(&bodies, "expo start") {
        "Expo web"
    } else if deps.contains("next") || has_marker(&bodies, "next dev") {
        "Next.js"
    } else if deps.contains("nuxt") || has_marker(&bodies, "nuxt dev") {
        "Nuxt"
    } else if deps.contains("@angular/core") || has_marker(&bodies, "ng serve") {
        "Angular"
    } else if deps.contains("@sveltejs/kit") {
        "SvelteKit"
    } else if deps.contains("astro") || has_marker(&bodies, "astro dev") {
        "Astro"
    } else if deps.contains("react-scripts") {
        "React"
    } else if deps.contains("vite") || has_marker(&bodies, "vite") {
        "Vite"
    } else {
        "Web app"
    }
}

pub(crate) fn select_script<'a>(
    framework: &str,
    scripts: &'a HashMap<String, String>,
) -> Option<(&'a str, &'a str)> {
    if framework == "Web app" {
        return None;
    }
    let order: &[&str] = if framework == "Expo web" {
        &["web", "dev", "start"]
    } else {
        &["dev", "web", "start", "serve", "preview"]
    };
    order.iter().find_map(|key| {
        scripts
            .get_key_value(*key)
            .map(|(key, value)| (key.as_str(), value.as_str()))
    })
}

pub(crate) fn safe_script(body: &str) -> bool {
    let unsafe_tokens = ["&", "||", ";", "|", "`", "$(", "\n", "\r", ">", "<"];
    !unsafe_tokens.iter().any(|token| body.contains(token))
        && !body.trim().is_empty()
        && body.len() <= 300
}

pub(crate) fn matches_framework_script(framework: &str, body: &str) -> bool {
    let body = body.to_ascii_lowercase();
    let markers: &[&str] = match framework {
        "Expo web" => &["expo"],
        "Next.js" => &["next"],
        "Nuxt" => &["nuxt"],
        "Angular" => &["ng serve"],
        "SvelteKit" => &["vite", "svelte-kit"],
        "Astro" => &["astro"],
        "React" => &["react-scripts"],
        "Vite" => &["vite"],
        _ => return false,
    };
    markers.iter().any(|marker| has_marker(&body, marker))
}

fn has_marker(body: &str, marker: &str) -> bool {
    body.match_indices(marker).any(|(index, _)| {
        let before = body[..index].chars().next_back();
        let after = body[index + marker.len()..].chars().next();
        !before.is_some_and(is_command_character) && !after.is_some_and(is_command_character)
    })
}

fn is_command_character(character: char) -> bool {
    character.is_ascii_alphanumeric() || matches!(character, '_' | '-')
}

pub(crate) fn native_only(deps: &HashSet<String>, root: &Path) -> bool {
    deps.contains("electron") || deps.contains("@tauri-apps/api") || root.join("src-tauri").is_dir()
}

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
    } else {
        vec!["run".into(), script.into(), "--".into()]
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
