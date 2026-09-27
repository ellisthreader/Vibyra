//! How each built-in agent's command gets onto this machine.
//!
//! Every package name and every binary name here was checked against the
//! registry that serves it — an Install button that runs the wrong package is
//! worse than no button, because it installs *something*.
//!
//! `Npm` is the only manager Vibyra runs itself: it is the one the account
//! CLIs already use, it is cross-platform, and `--global` never touches the
//! project the user is in. Anything else is reported as a command to run,
//! spelled out, rather than pretended away.

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallManager {
    /// Vibyra can run this one: `npm install --global <package>`.
    Npm,
    /// Vibyra cannot run this one; the command is shown so the user can.
    Manual,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallHint {
    pub manager: InstallManager,
    /// What `manager` installs; also what the UI names.
    pub package: &'static str,
    /// The exact command, for the UI to show and for a manual install to copy.
    pub command: String,
}

/// Agent id -> npm package. The binary each package provides is asserted in
/// `install_tests.rs` against the program the catalog launches, so a package
/// that stops shipping the command Vibyra runs fails the build rather than a
/// user's install.
const NPM: [(&str, &str); 9] = [
    ("codex", "@openai/codex"),
    ("claude", "@anthropic-ai/claude-code"),
    ("gemini", "@google/gemini-cli"),
    ("qwen", "@qwen-code/qwen-code"),
    ("opencode", "opencode-ai"),
    ("copilot", "@github/copilot"),
    ("crush", "@charmland/crush"),
    ("amp", "@sourcegraph/amp"),
    ("continue", "@continuedev/cli"),
];

/// Agents whose command does not come from npm. Spelled out rather than
/// offered as a button Vibyra cannot honour.
const MANUAL: [(&str, &str, &str); 1] =
    [("aider", "aider-chat", "python3 -m pip install aider-chat")];

pub fn install_hint(agent_id: &str) -> Option<InstallHint> {
    if let Some((_, package)) = NPM.iter().find(|(id, _)| *id == agent_id) {
        return Some(InstallHint {
            manager: InstallManager::Npm,
            package,
            command: format!("npm install --global {package}"),
        });
    }
    MANUAL
        .iter()
        .find(|(id, _, _)| *id == agent_id)
        .map(|(_, package, command)| InstallHint {
            manager: InstallManager::Manual,
            package,
            command: (*command).to_string(),
        })
}

/// The npm package for an agent Vibyra may install itself, or `None` when it
/// must not try.
pub fn npm_package(agent_id: &str) -> Option<&'static str> {
    NPM.iter()
        .find(|(id, _)| *id == agent_id)
        .map(|(_, package)| *package)
}

#[cfg(test)]
#[path = "install_tests.rs"]
mod tests;
