//! The AI account Agent runs use on this Mac, chosen in Vibyra's UI and kept
//! beside the settings file. Only ids are stored — login material stays in
//! the account's own folder or keychain entry.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Selection {
    pub provider: String,
    /// Local account id (`default` or a registry id). Not secret.
    pub account: String,
    pub model: String,
    #[serde(default)]
    pub effort: Option<String>,
}

const PROVIDERS: [&str; 3] = ["claude", "codex", "gemini"];
const EFFORTS: [&str; 6] = ["minimal", "low", "medium", "high", "xhigh", "max"];

fn token(value: &str, max: usize, extra: &[u8]) -> bool {
    !value.is_empty()
        && value.len() <= max
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || extra.contains(&b))
}

impl Selection {
    pub fn validate(&self) -> Result<(), String> {
        if !PROVIDERS.contains(&self.provider.as_str()) {
            return Err("Choose Claude, Codex or Gemini.".into());
        }
        if !token(&self.account, 128, b"-_.") {
            return Err("Choose a valid AI account.".into());
        }
        if !token(&self.model, 120, b"-_.:[]/") {
            return Err("Choose a valid model.".into());
        }
        if self
            .effort
            .as_deref()
            .is_some_and(|effort| !EFFORTS.contains(&effort))
        {
            return Err("Choose a valid effort level.".into());
        }
        Ok(())
    }

    /// Only Claude Code has proven broker-only tool control so far
    /// (`docs/agent-v2-provider-adapters.md`).
    pub fn controlled_tools(&self) -> bool {
        self.provider == "claude"
    }
}

pub fn path(settings_dir: &Path) -> PathBuf {
    settings_dir.join("agent-v2-selection.json")
}

pub fn load(settings_dir: &Path) -> Option<Selection> {
    let text = std::fs::read_to_string(path(settings_dir)).ok()?;
    let selection: Selection = serde_json::from_str(&text).ok()?;
    selection.validate().ok().map(|_| selection)
}

pub fn save(settings_dir: &Path, selection: &Selection) -> Result<(), String> {
    selection.validate()?;
    let text = serde_json::to_string_pretty(selection).map_err(|e| e.to_string())?;
    let file = path(settings_dir);
    let temp = file.with_extension("json.tmp");
    std::fs::write(&temp, text)
        .and_then(|_| std::fs::rename(&temp, &file))
        .map_err(|_| "Could not save the Agent AI account.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn claude() -> Selection {
        Selection {
            provider: "claude".into(),
            account: "default".into(),
            model: "claude-sonnet-4-5".into(),
            effort: Some("high".into()),
        }
    }

    #[test]
    fn selections_round_trip_and_reject_bad_values() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &claude()).unwrap();
        assert_eq!(load(dir.path()), Some(claude()));
        for bad in [
            Selection {
                provider: "openrouter".into(),
                ..claude()
            },
            Selection {
                account: "../x".into(),
                ..claude()
            },
            Selection {
                model: "a b".into(),
                ..claude()
            },
            Selection {
                effort: Some("turbo".into()),
                ..claude()
            },
        ] {
            assert!(bad.validate().is_err());
        }
        assert!(claude().controlled_tools());
        assert!(!Selection {
            provider: "codex".into(),
            ..claude()
        }
        .controlled_tools());
    }
}
