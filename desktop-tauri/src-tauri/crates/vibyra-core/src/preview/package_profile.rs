use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde_json::Value;

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
    } else if has_marker(&bodies, "ionic serve") {
        "Ionic web"
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
    } else if deps.contains("webpack-dev-server")
        || has_marker(&bodies, "webpack serve")
        || has_marker(&bodies, "webpack-dev-server")
    {
        "Webpack"
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
        &[
            "web",
            "dev",
            "start",
            "start:web",
            "start:go",
            "start:dev-client",
        ]
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
