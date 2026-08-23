struct LaunchCommand<'a> {
    executable: &'a str,
    args: &'a [String],
}

pub(crate) fn matches_framework_script(framework: &str, body: &str) -> bool {
    let tokens = body
        .split_ascii_whitespace()
        .map(normalize)
        .collect::<Vec<_>>();
    let Some(command) = launch_command(&tokens) else {
        return false;
    };
    match framework {
        "Expo web" => {
            command_is(&command, &["expo", "expo-cli"]) || cli_path_is(&command, "/expo/bin/cli")
        }
        "Ionic web" => command_pair_is(&command, "ionic", "serve"),
        "Next.js" => {
            command_is(&command, &["next"]) || cli_path_is(&command, "/next/dist/bin/next")
        }
        "Nuxt" => command_is(&command, &["nuxt", "nuxi"]),
        "Angular" => command_pair_is(&command, "ng", "serve"),
        "SvelteKit" => command_is(&command, &["vite", "svelte-kit"]),
        "Astro" => command_is(&command, &["astro"]),
        "React" => command_is(&command, &["react-scripts"]),
        "Vite" => command_is(&command, &["vite"]) || cli_path_is(&command, "/vite/bin/vite"),
        "Webpack" => command_is(&command, &["webpack", "webpack-dev-server"]),
        _ => false,
    }
}

fn launch_command(tokens: &[String]) -> Option<LaunchCommand<'_>> {
    let mut index = 0;
    while tokens.get(index).is_some_and(|token| assignment(token)) {
        index += 1;
    }
    if matches!(tokens.get(index).map(String::as_str), Some("cross-env")) {
        index += 1;
        while tokens.get(index).is_some_and(|token| assignment(token)) {
            index += 1;
        }
    }
    let runner = tokens.get(index)?.as_str();
    if matches!(runner, "npx" | "bunx") {
        index += 1;
        while tokens
            .get(index)
            .is_some_and(|token| token.starts_with('-'))
        {
            index += 1;
        }
    } else if matches!(runner, "pnpm" | "yarn") {
        index += 1;
        if matches!(tokens.get(index).map(String::as_str), Some("exec" | "dlx")) {
            index += 1;
        }
    } else if runner == "npm" {
        index += 1;
        if !matches!(tokens.get(index).map(String::as_str), Some("exec" | "x")) {
            return None;
        }
        index += 1;
        if tokens.get(index).map(String::as_str) == Some("--") {
            index += 1;
        }
    } else if matches!(runner, "node" | "node.exe") {
        index += 1;
    }
    Some(LaunchCommand {
        executable: tokens.get(index)?,
        args: tokens.get(index + 1..).unwrap_or_default(),
    })
}

fn normalize(token: &str) -> String {
    token
        .trim_matches(['\'', '"'])
        .replace('\\', "/")
        .to_ascii_lowercase()
}

fn assignment(token: &str) -> bool {
    token
        .split_once('=')
        .is_some_and(|(name, _)| !name.is_empty() && !name.contains('/'))
}

fn command_is(command: &LaunchCommand<'_>, names: &[&str]) -> bool {
    let leaf = command
        .executable
        .rsplit('/')
        .next()
        .unwrap_or(command.executable);
    names.contains(&leaf.strip_suffix(".cmd").unwrap_or(leaf))
}

fn command_pair_is(command: &LaunchCommand<'_>, name: &str, argument: &str) -> bool {
    command_is(command, &[name]) && command.args.first().map(String::as_str) == Some(argument)
}

fn cli_path_is(command: &LaunchCommand<'_>, marker: &str) -> bool {
    command.executable.contains(marker)
}

#[cfg(test)]
mod tests {
    use super::matches_framework_script;

    #[test]
    fn matches_launch_commands_but_not_incidental_arguments() {
        assert!(matches_framework_script("Expo web", "npx expo start"));
        assert!(matches_framework_script("Vite", "cross-env MODE=dev vite"));
        assert!(!matches_framework_script(
            "Expo web",
            "node script.mjs expo"
        ));
        assert!(!matches_framework_script("Vite", "echo vite"));
    }
}
