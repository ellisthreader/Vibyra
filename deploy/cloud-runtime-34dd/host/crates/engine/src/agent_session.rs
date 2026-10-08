//! What a coding CLI needs to be picked up again: its own session id and the
//! transcript it keeps. The id reaches a command line, so it is held to a plain
//! UUID rather than trusted.
use std::path::{Path, PathBuf};

/// Typed error code the phone reads to offer a fresh start instead.
pub(crate) const RESUME_UNAVAILABLE: &str = "resume_unavailable";

/// Errors the phone can tell apart carry their code in front: `code: message`.
pub(crate) fn unavailable(message: &str) -> String {
    format!("{RESUME_UNAVAILABLE}: {message}")
}

/// Where each CLI keeps its sessions: `$CLAUDE_CONFIG_DIR` or `~/.claude`,
/// `$CODEX_HOME` or `~/.codex`.
#[derive(Clone, Debug)]
pub(crate) struct Homes {
    pub claude: PathBuf,
    pub codex: PathBuf,
}

impl Homes {
    pub fn from_env() -> Self {
        let home = dirs::home_dir().unwrap_or_default();
        let pick = |variable: &str, leaf: &str| {
            std::env::var_os(variable)
                .filter(|value| !value.is_empty())
                .map(PathBuf::from)
                .unwrap_or_else(|| home.join(leaf))
        };
        Self {
            claude: pick("CLAUDE_CONFIG_DIR", ".claude"),
            codex: pick("CODEX_HOME", ".codex"),
        }
    }
}

/// `8-4-4-4-12` hex digits and nothing else.
pub(crate) fn valid_id(id: &str) -> bool {
    id.len() == 36
        && id.chars().enumerate().all(|(index, character)| {
            if matches!(index, 8 | 13 | 18 | 23) {
                character == '-'
            } else {
                character.is_ascii_hexdigit()
            }
        })
}

/// Whether `provider` still has a transcript for `id` on disk. Claude files
/// them `projects/<encoded cwd>/<id>.jsonl`; Codex `sessions/Y/M/D/rollout-*-<id>.jsonl`.
pub(crate) fn transcript_exists(provider: &str, homes: &Homes, id: &str) -> bool {
    if !valid_id(id) {
        return false;
    }
    match provider {
        "claude" => claude_transcript(&homes.claude.join("projects"), id),
        "codex" => codex_transcript(&homes.codex.join("sessions"), id, 0),
        _ => false,
    }
}

fn claude_transcript(projects: &Path, id: &str) -> bool {
    let Ok(entries) = std::fs::read_dir(projects) else {
        return false;
    };
    let name = format!("{id}.jsonl");
    entries
        .flatten()
        .any(|entry| entry.path().join(&name).is_file())
}

fn codex_transcript(directory: &Path, id: &str, depth: usize) -> bool {
    let Ok(entries) = std::fs::read_dir(directory) else {
        return false;
    };
    let suffix = format!("-{id}.jsonl");
    entries.flatten().any(|entry| {
        let Ok(kind) = entry.file_type() else {
            return false;
        };
        if kind.is_dir() {
            return depth < 4 && codex_transcript(&entry.path(), id, depth + 1);
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        kind.is_file() && name.starts_with("rollout-") && name.ends_with(&suffix)
    })
}

#[cfg(test)]
#[path = "agent_session_tests.rs"]
mod tests;
