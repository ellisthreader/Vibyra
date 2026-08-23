use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

use super::package_command::matches_framework_script;
use super::package_profile::safe_script;

const MAX_ALIAS_DEPTH: usize = 4;
const MAX_WRAPPER_BYTES: u64 = 128 * 1024;

pub(crate) fn script_launches_framework(
    project_root: &Path,
    app_root: &Path,
    framework: &str,
    body: &str,
    scripts: &HashMap<String, String>,
) -> bool {
    launches(
        project_root,
        app_root,
        framework,
        body,
        scripts,
        &mut HashSet::new(),
        0,
    )
}

fn launches(
    project_root: &Path,
    app_root: &Path,
    framework: &str,
    body: &str,
    scripts: &HashMap<String, String>,
    visited: &mut HashSet<String>,
    depth: usize,
) -> bool {
    if matches_framework_script(framework, body) {
        return true;
    }
    if depth >= MAX_ALIAS_DEPTH {
        return false;
    }
    if let Some(alias) = package_script_alias(body) {
        let Some(next) = scripts.get(alias) else {
            return false;
        };
        if safe_script(next) && visited.insert(alias.into()) {
            return launches(
                project_root,
                app_root,
                framework,
                next,
                scripts,
                visited,
                depth + 1,
            );
        }
    }
    local_wrapper(body)
        .is_some_and(|path| verified_wrapper(project_root, app_root, path, framework))
}

fn package_script_alias(body: &str) -> Option<&str> {
    let tokens = body.split_ascii_whitespace().collect::<Vec<_>>();
    let command = tokens.first()?.trim_matches(['\'', '"']);
    match command {
        "npm" if matches!(tokens.get(1), Some(&"run") | Some(&"run-script")) => tokens.get(2),
        "pnpm" | "yarn" if tokens.get(1) == Some(&"run") => tokens.get(2),
        "pnpm" | "yarn" => tokens.get(1),
        "bun" if tokens.get(1) == Some(&"run") => tokens.get(2),
        _ => None,
    }
    .map(|token| token.trim_matches(['\'', '"']))
}

fn local_wrapper(body: &str) -> Option<&str> {
    let tokens = body.split_ascii_whitespace().collect::<Vec<_>>();
    let command = tokens.first()?.trim_matches(['\'', '"']);
    let leaf = command.rsplit(['/', '\\']).next().unwrap_or(command);
    if !matches!(leaf, "node" | "node.exe") {
        return None;
    }
    let path = tokens.get(1)?.trim_matches(['\'', '"']);
    if path.starts_with('-') || Path::new(path).is_absolute() {
        return None;
    }
    matches!(
        Path::new(path).extension().and_then(|value| value.to_str()),
        Some("js" | "mjs" | "cjs")
    )
    .then_some(path)
}

fn verified_wrapper(project_root: &Path, app_root: &Path, relative: &str, framework: &str) -> bool {
    let Ok(path) = fs::canonicalize(app_root.join(relative)) else {
        return false;
    };
    let Ok(project_root) = fs::canonicalize(project_root) else {
        return false;
    };
    if !path.starts_with(project_root) || !path.is_file() {
        return false;
    }
    let Ok(metadata) = path.metadata() else {
        return false;
    };
    if metadata.len() > MAX_WRAPPER_BYTES {
        return false;
    }
    let Ok(source) = fs::read_to_string(path) else {
        return false;
    };
    let lower = source.to_ascii_lowercase();
    let forwards_args =
        lower.contains("process.argv") || lower.contains("bun.argv") || lower.contains("deno.args");
    let launches_child = ["spawn", "execfile", "execa"]
        .iter()
        .any(|marker| lower.contains(marker));
    forwards_args && launches_child && wrapper_mentions_framework(framework, &lower)
}

fn wrapper_mentions_framework(framework: &str, source: &str) -> bool {
    let has_word = |needle: &str| {
        source
            .split(|character: char| {
                !(character.is_ascii_alphanumeric() || matches!(character, '_' | '-'))
            })
            .any(|word| word == needle)
    };
    match framework {
        "Expo web" => has_word("expo") && has_word("start"),
        "Ionic web" => has_word("ionic") && has_word("serve"),
        "Angular" => has_word("ng") && has_word("serve"),
        "Next.js" => has_word("next"),
        "Nuxt" => has_word("nuxt") || has_word("nuxi"),
        "SvelteKit" => has_word("vite") || has_word("svelte-kit"),
        "Astro" => has_word("astro"),
        "React" => has_word("react-scripts"),
        "Vite" => has_word("vite"),
        "Webpack" => has_word("webpack") || has_word("webpack-dev-server"),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::package_script_alias;

    #[test]
    fn extracts_common_package_script_aliases() {
        assert_eq!(
            package_script_alias("npm run start -- --web"),
            Some("start")
        );
        assert_eq!(package_script_alias("pnpm run dev"), Some("dev"));
        assert_eq!(package_script_alias("yarn web"), Some("web"));
        assert_eq!(package_script_alias("node scripts/dev.mjs"), None);
    }
}
