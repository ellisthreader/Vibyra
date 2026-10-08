use std::collections::{HashMap, HashSet};
use std::path::Path;

use serde_json::Value;

pub(crate) use super::package_runtime::{
    append_runtime_args, device_hint, manager_args, package_manager,
};

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
    } else if deps.contains("gatsby") || has_marker(&bodies, "gatsby develop") {
        "Gatsby"
    } else if deps.contains("@vue/cli-service") || has_marker(&bodies, "vue-cli-service") {
        "Vue CLI"
    } else if deps.contains("@11ty/eleventy") || has_marker(&bodies, "eleventy") {
        "Eleventy"
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
    } else if framework == "Gatsby" {
        &["develop", "dev", "start"]
    } else if framework == "Vue CLI" {
        &["serve", "dev", "start"]
    } else if framework == "Eleventy" {
        &["start", "dev", "serve"]
    } else {
        &["dev", "web", "start", "serve", "preview"]
    };
    let candidates = || {
        order.iter().filter_map(|key| {
            scripts
                .get_key_value(*key)
                .map(|(key, value)| (key.as_str(), value.as_str()))
        })
    };
    candidates()
        .find(|(_, body)| safe_script(body) && matches_framework_script(framework, body))
        .or_else(|| candidates().next())
}

/// A script may chain steps with `&&` or `;` (generate types, then start the
/// server): the runtime flags are appended to the whole script, so they land on
/// its last command. Pipes, background jobs, substitution and redirection are
/// refused because the last command would no longer be the server.
pub(crate) fn safe_script(body: &str) -> bool {
    let unsafe_tokens = ["&", "|", "`", "$(", "\n", "\r", ">", "<"];
    let rest = body.replace("&&", " ");
    !unsafe_tokens.iter().any(|token| rest.contains(token))
        && !body.trim().is_empty()
        && body.len() <= 300
}

/// The command that runs last, which is where appended flags end up.
pub(crate) fn last_segment(body: &str) -> &str {
    body.split("&&")
        .flat_map(|part| part.split(';'))
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .last()
        .unwrap_or("")
}

/// Process managers start other commands, so flags appended to them never
/// reach the framework.
const WRAPPERS: [&str; 9] = [
    "concurrently",
    "npm-run-all",
    "run-p",
    "run-s",
    "turbo",
    "nx",
    "lerna",
    "wireit",
    "foreman",
];

pub(crate) fn is_wrapper(body: &str) -> bool {
    last_segment(body)
        .split_whitespace()
        .next()
        .is_some_and(|first| WRAPPERS.contains(&first))
}

pub(crate) fn matches_framework_script(framework: &str, body: &str) -> bool {
    if is_wrapper(body) {
        return false;
    }
    let body = last_segment(body).to_ascii_lowercase();
    let markers: &[&str] = match framework {
        "Expo web" => &["expo"],
        "Next.js" => &["next"],
        "Nuxt" => &["nuxt"],
        "Angular" => &["ng serve"],
        "SvelteKit" => &["vite", "svelte-kit"],
        "Astro" => &["astro"],
        "Gatsby" => &["gatsby"],
        "Vue CLI" => &["vue-cli-service"],
        "Eleventy" => &["eleventy", "11ty"],
        "React" => &["react-scripts"],
        "Vite" => &["vite"],
        _ => return false,
    };
    markers.iter().any(|marker| has_marker(&body, marker))
}

pub(crate) fn has_marker(body: &str, marker: &str) -> bool {
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
