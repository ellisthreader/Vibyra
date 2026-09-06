//! What the installed CLIs can actually do, asked rather than assumed.
//!
//! Both engines are npm packages the user updates on their own schedule, and
//! both have changed their flags inside a release series. Vibyra's job is to
//! offer only controls it has evidence for, and to fail with a sentence a
//! person can act on when a version is too old — never to send a flag into the
//! dark and render the resulting exit-2 as a broken chat.
//!
//! The probe is the CLI's own `--version`, which is cheap, and its `--help`,
//! which is the only honest source for whether a flag exists in *this* build.
//! The snapshot is recorded against every turn so a transcript from last month
//! can still be explained.

use serde::{Deserialize, Serialize};

use crate::agent_model::Engine;

/// Oldest tested versions for forced Claude settings and Codex named permission profiles.
const CLAUDE_FLOOR: (u32, u32, u32) = (2, 1, 261);
const CODEX_FLOOR: (u32, u32, u32) = (0, 153, 2);

/// What one engine offers on this machine.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineCapabilities {
    pub engine: Engine,
    pub installed: bool,
    pub version: String,
    /// False when the CLI is present but too old, or its help does not carry
    /// the flags the adapter depends on. Terminal launching still works; only
    /// structured chat is withheld.
    pub structured: bool,
    pub supports_model: bool,
    pub supports_effort: bool,
    pub supports_images: bool,
    /// What to tell the user when `structured` is false. Empty when it is true.
    pub blocker: String,
}

impl EngineCapabilities {
    /// The record stored with a turn: enough to explain it later, no more.
    pub fn snapshot(&self) -> String {
        format!("{}:{}", self.engine.as_str(), self.version)
    }
}

/// Reads a version string and the help text into a capability set.
///
/// Split from the probing so it can be tested against captured fixtures for
/// versions that are not installed on the machine running the tests.
pub fn interpret(engine: Engine, version: &str, help: &str) -> EngineCapabilities {
    let parsed = parse_version(version);
    let floor = match engine {
        Engine::Claude => CLAUDE_FLOOR,
        Engine::Codex => CODEX_FLOOR,
    };
    let installed = !version.trim().is_empty();
    let recent = parsed.is_some_and(|found| found >= floor);
    let required: &[&str] = match engine {
        Engine::Claude => &[
            "--session-id",
            "--resume",
            "stream-json",
            "--permission-mode",
            "--settings",
            "--setting-sources",
            "--strict-mcp-config",
            "--tools",
            "--input-format",
        ],
        Engine::Codex => &["--json", "resume"],
    };
    let missing: Vec<&str> = required
        .iter()
        .copied()
        .filter(|flag| !help.contains(flag))
        .collect();

    let blocker = if !installed {
        format!("{} is not installed.", engine.as_str())
    } else if !recent {
        format!(
            "{} {version} is older than the {}.{}.{} this needs. Update it to use Agent Mode; \
             terminals still work.",
            engine.as_str(),
            floor.0,
            floor.1,
            floor.2
        )
    } else if !missing.is_empty() {
        format!(
            "This build of {} does not offer {}. Update it to use Agent Mode; \
             terminals still work.",
            engine.as_str(),
            missing.join(", ")
        )
    } else {
        String::new()
    };

    EngineCapabilities {
        engine,
        installed,
        version: version.trim().to_string(),
        structured: blocker.is_empty(),
        supports_model: help.contains("--model") || help.contains("-m, --model"),
        supports_effort: help.contains("--effort") || (engine == Engine::Codex && recent),
        supports_images: help.contains("--image")
            || help.contains("-i, --image")
            || (engine == Engine::Claude && help.contains("--input-format")),
        blocker,
    }
}

/// Pulls `major.minor.patch` out of whatever the CLI prints.
///
/// The two disagree on shape — Claude answers `2.1.251 (Claude Code)` and
/// Codex answers `codex-cli 0.150.1` — so this finds the first dotted number
/// rather than trusting a position.
fn parse_version(text: &str) -> Option<(u32, u32, u32)> {
    for token in text.split(|c: char| c.is_whitespace() || c == '(' || c == ')') {
        let mut parts = token.split('.');
        let (Some(major), Some(minor)) = (parts.next(), parts.next()) else {
            continue;
        };
        if let (Ok(major), Ok(minor)) = (major.parse(), minor.trim_end_matches(',').parse()) {
            let patch = parts
                .next()
                .and_then(|part| part.trim_end_matches(',').parse().ok())
                .unwrap_or(0);
            return Some((major, minor, patch));
        }
    }
    None
}

#[cfg(test)]
#[path = "capabilities_tests.rs"]
mod tests;
