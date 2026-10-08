//! Why a run failed, classified from its error and the end of its log, in words
//! a person who did not write the project can act on. Done here so the desktop,
//! the phone and agents all explain a failure the same way.

use super::types::PreviewErrorCode;

pub(crate) struct Diagnosis {
    pub code: PreviewErrorCode,
    /// One plain sentence: what went wrong.
    pub summary: String,
    /// What to do next.
    pub hint: String,
    /// The line from the project's own output that says why, when there is one.
    pub cause: Option<String>,
}

fn says(text: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| text.contains(needle))
}

/// The program named in "could not start pnpm: …", for "Vibyra couldn't find pnpm".
fn missing_tool(error: &str) -> Option<&str> {
    let rest = error.strip_prefix("could not start ")?;
    rest.split(':')
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
}

/// The last line of output that reads like a complaint, without its `[Vite error]` prefix.
fn cause_line(logs: &[String]) -> Option<String> {
    const WORDS: [&str; 7] = [
        "error",
        "failed",
        "cannot",
        "can't",
        "not found",
        "missing",
        "denied",
    ];
    let clean = |line: &str| {
        let line = line.trim();
        let line = line
            .strip_prefix('[')
            .and_then(|rest| rest.split_once(']'))
            .map_or(line, |(_, rest)| rest);
        line.trim().trim_start_matches("npm ERR!").trim().to_owned()
    };
    logs.iter()
        .rev()
        .filter(|line| !line.starts_with("$ ") && !line.starts_with("Preparing "))
        .map(|line| clean(line))
        .find(|line| line.len() > 8 && says(&line.to_ascii_lowercase(), &WORDS))
        .map(|line| line.chars().take(220).collect())
}

pub(crate) fn diagnose(error: &str, logs: &[String]) -> Diagnosis {
    let tail = logs
        .iter()
        .rev()
        .take(80)
        .map(String::as_str)
        .collect::<Vec<_>>()
        .join("\n");
    let text = format!("{error}\n{tail}").to_ascii_lowercase();
    let error_lower = error.to_ascii_lowercase();
    let cause = cause_line(logs);
    let (code, summary, hint): (_, String, &str) = if error_lower
        .contains("installing dependencies")
    {
        (
                PreviewErrorCode::InstallFailed,
                "Couldn’t install this project’s packages".into(),
                "Preview tried to install what the project needs and that didn’t finish. Check your internet connection, then try again. Details has the install log.",
            )
    } else if error_lower.contains("could not start")
        && says(
            &error_lower,
            &["no such file", "not found", "os error 2", "cannot find"],
        )
    {
        let name = missing_tool(error).unwrap_or("a tool");
        (
                PreviewErrorCode::ToolNotFound,
                format!("Vibyra couldn’t find {name} on this Mac"),
                "This project needs it to run. Install it (Node.js from nodejs.org, or Homebrew), then try again. If it’s already installed, restart Vibyra so it can find it.",
            )
    } else if says(
        &text,
        &[
            "eaddrinuse",
            "address already in use",
            "port is already in use",
        ],
    ) {
        (
                PreviewErrorCode::PortInUse,
                "Another program is already using that port".into(),
                "Close the other server or terminal running this app, then try again. Preview picks a free port itself, so this usually means the project hard-codes one.",
            )
    } else if says(
        &text,
        &[
            "react-native-web",
            "@expo/metro-runtime",
            "install the following packages",
            "web support",
        ],
    ) {
        (
                PreviewErrorCode::MissingWebSupport,
                "This Expo app isn’t set up to run on the web yet".into(),
                "Preview shows the web version. In the app’s folder run npx expo install react-native-web react-dom @expo/metro-runtime, then try again.",
            )
    } else if says(
        &text,
        &[
            "unsupported engine",
            "requires node",
            "you are using node",
            "unexpected token '?'",
            "unexpected token '??='",
        ],
    ) {
        (
                PreviewErrorCode::NodeVersion,
                "This project needs a different version of Node.js".into(),
                "Switch to the version the project asks for (look for .nvmrc or \"engines\" in package.json; nvm use or Volta does it), then try again.",
            )
    } else if says(
        &text,
        &[
            "command not found",
            "cannot find module",
            "err_module_not_found",
            "is not recognized",
            ": not found",
            "enoent",
        ],
    ) {
        (
            PreviewErrorCode::MissingDependencies,
            "This project’s packages aren’t installed properly".into(),
            "Delete the node_modules folder and try again; Preview will reinstall everything.",
        )
    } else if error_lower.contains("did not become ready") {
        (
                PreviewErrorCode::Timeout,
                "The server started but never opened a page".into(),
                "It may be stuck, or listening on a fixed port instead of the one Preview gives it (PORT or --port). Details shows what it printed.",
            )
    } else {
        (
                PreviewErrorCode::Exited,
                "The app stopped on its own".into(),
                "It started and then quit. The last lines in Details usually say why; fix that and try again.",
            )
    };
    Diagnosis {
        code,
        summary,
        hint: hint.into(),
        cause,
    }
}

#[cfg(test)]
#[path = "diagnose_tests.rs"]
mod tests;
