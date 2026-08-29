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

/// The minimum each engine needs for structured chat.
///
/// Claude gained `--session-id` and stream-json well before 2.x; the floor
/// here is the oldest version this was verified against rather than the oldest
/// that might work. Codex's `exec --json` item envelopes settled in 0.14x.
const CLAUDE_FLOOR: (u32, u32) = (2, 0);
const CODEX_FLOOR: (u32, u32) = (0, 140);

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
            "{} {version} is older than the {}.{} this needs. Update it to use Agent Mode; \
             terminals still work.",
            engine.as_str(),
            floor.0,
            floor.1
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
        supports_effort: help.contains("--effort") || help.contains("model_reasoning_effort"),
        supports_images: help.contains("--image") || help.contains("-i, --image"),
        blocker,
    }
}

/// Pulls `major.minor` out of whatever the CLI prints.
///
/// The two disagree on shape — Claude answers `2.1.251 (Claude Code)` and
/// Codex answers `codex-cli 0.150.1` — so this finds the first dotted number
/// rather than trusting a position.
fn parse_version(text: &str) -> Option<(u32, u32)> {
    for token in text.split(|c: char| c.is_whitespace() || c == '(' || c == ')') {
        let mut parts = token.split('.');
        let (Some(major), Some(minor)) = (parts.next(), parts.next()) else {
            continue;
        };
        if let (Ok(major), Ok(minor)) = (major.parse(), minor.trim_end_matches(',').parse()) {
            return Some((major, minor));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The two version strings this code actually meets, both parsed from the
    /// real CLIs on 2026-08-29.
    #[test]
    fn reads_both_providers_version_shapes() {
        assert_eq!(parse_version("2.1.251 (Claude Code)"), Some((2, 1)));
        assert_eq!(parse_version("codex-cli 0.150.1"), Some((0, 150)));
        assert_eq!(parse_version("no numbers here"), None);
    }

    #[test]
    fn a_recent_claude_with_the_right_flags_is_usable() {
        let help = "--session-id <uuid> --resume [value] --output-format stream-json \
                    --permission-mode <mode> --model <model> --effort <level>";
        let found = interpret(Engine::Claude, "2.1.251 (Claude Code)", help);
        assert!(found.structured, "{}", found.blocker);
        assert!(found.supports_model && found.supports_effort);
    }

    /// An old CLI loses structured chat and keeps its terminal, and the
    /// message says which.
    #[test]
    fn an_old_cli_is_refused_with_something_to_do_about_it() {
        let found = interpret(Engine::Codex, "codex-cli 0.90.0", "--json resume");
        assert!(!found.structured);
        assert!(
            found.blocker.contains("terminals still work"),
            "{}",
            found.blocker
        );
    }

    /// Present, recent, but missing a flag the adapter depends on: still
    /// refused, and the message names the flag rather than guessing.
    #[test]
    fn a_missing_flag_is_named() {
        let found = interpret(
            Engine::Claude,
            "2.1.251",
            "--resume stream-json --permission-mode",
        );
        assert!(!found.structured);
        assert!(found.blocker.contains("--session-id"), "{}", found.blocker);
    }

    #[test]
    fn a_missing_cli_says_so_plainly() {
        let found = interpret(Engine::Codex, "", "");
        assert!(!found.installed && !found.structured);
        assert!(found.blocker.contains("not installed"));
    }
}
