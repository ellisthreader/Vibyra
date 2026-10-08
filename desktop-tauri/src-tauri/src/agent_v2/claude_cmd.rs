//! The exact Claude Code command line for a broker-only Agent run
//! (`docs/agent-v2-provider-adapters.md`, Claude Code 2.1.285).
//!
//! The process starts from an empty environment (`env -i` equivalent): the
//! app forwards `CLAUDE_CODE_*` and may carry API keys, and a remove-list
//! misses new variables. Only the variables below are set.

use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq)]
pub struct Launch {
    pub program: PathBuf,
    pub args: Vec<String>,
    /// The complete environment; the child inherits nothing else.
    pub env: Vec<(String, String)>,
    pub cwd: PathBuf,
}

pub struct LaunchInput<'a> {
    pub program: &'a Path,
    pub mcp_config: &'a Path,
    pub allowed_tools: &'a [String],
    pub model: &'a str,
    pub effort: Option<&'a str>,
    pub workdir: &'a Path,
    pub home: &'a Path,
    pub user: &'a str,
    pub tmpdir: &'a Path,
    /// `CLAUDE_CONFIG_DIR` for a non-default account; `None` for the CLI's own.
    pub config_dir: Option<&'a Path>,
}

const EFFORTS: [&str; 5] = ["low", "medium", "high", "xhigh", "max"];

/// Names that must never reach the provider process.
#[cfg(test)]
pub const FORBIDDEN_ENV: [&str; 9] = [
    "ANTHROPIC_API_KEY",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "OPENAI_API_KEY",
    "CODEX_API_KEY",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "OPENROUTER_API_KEY",
    "CLAUDECODE",
];

pub fn build(input: &LaunchInput<'_>) -> Launch {
    let mut args: Vec<String> = [
        "-p",
        "--input-format",
        "stream-json",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--mcp-config",
    ]
    .map(str::to_owned)
    .to_vec();
    args.push(input.mcp_config.to_string_lossy().into_owned());
    args.extend(
        [
            "--strict-mcp-config",
            "--setting-sources",
            "",
            "--permission-mode",
            "dontAsk",
        ]
        .map(str::to_owned),
    );
    if !input.allowed_tools.is_empty() {
        args.push("--allowedTools".into());
        args.extend(input.allowed_tools.iter().cloned());
    }
    args.extend(
        [
            "--disable-slash-commands",
            "--no-chrome",
            "--no-session-persistence",
            "--model",
        ]
        .map(str::to_owned),
    );
    args.push(input.model.to_owned());
    if let Some(effort) = input.effort.filter(|effort| EFFORTS.contains(effort)) {
        args.push("--effort".into());
        args.push(effort.to_owned());
    }
    let mut path = String::from("/usr/bin:/bin");
    if let Some(dir) = input
        .program
        .parent()
        .filter(|dir| !dir.as_os_str().is_empty())
    {
        path.push(':');
        path.push_str(&dir.to_string_lossy());
    }
    let mut env = vec![
        ("HOME".to_owned(), input.home.to_string_lossy().into_owned()),
        ("USER".to_owned(), input.user.to_owned()),
        ("LOGNAME".to_owned(), input.user.to_owned()),
        (
            "TMPDIR".to_owned(),
            input.tmpdir.to_string_lossy().into_owned(),
        ),
        ("LANG".to_owned(), "en_US.UTF-8".to_owned()),
        ("PATH".to_owned(), path),
    ];
    if let Some(dir) = input.config_dir {
        env.push((
            "CLAUDE_CONFIG_DIR".into(),
            dir.to_string_lossy().into_owned(),
        ));
    }
    Launch {
        program: input.program.to_path_buf(),
        args,
        env,
        cwd: input.workdir.to_path_buf(),
    }
}

/// A `Command` that inherits nothing from the app's environment.
pub fn command(launch: &Launch) -> std::process::Command {
    let mut command = std::process::Command::new(&launch.program);
    command
        .env_clear()
        .envs(launch.env.iter().map(|(k, v)| (k, v)))
        .args(&launch.args)
        .current_dir(&launch.cwd);
    command
}

/// `claude` on the (login-shell-augmented) PATH, as an absolute path.
pub fn find_program(name: &str) -> Option<PathBuf> {
    let path = std::env::var_os("PATH")?;
    std::env::split_paths(&path)
        .map(|dir| dir.join(name))
        .find(|candidate| candidate.is_file())
}

/// Claude Code keeps per-folder memory in `<config>/projects/<cwd with every
/// non-alphanumeric character replaced by '-'>`.
pub fn project_dir_name(cwd: &Path) -> String {
    cwd.to_string_lossy()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect()
}

#[cfg(test)]
#[path = "claude_cmd_tests.rs"]
mod tests;
