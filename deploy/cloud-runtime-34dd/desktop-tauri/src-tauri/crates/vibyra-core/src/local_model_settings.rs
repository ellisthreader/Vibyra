//! The "Local model" choice for the desktop assistant, persisted as one field
//! inside [`Settings`]. Only text lives here: the loopback rule is enforced by
//! the app crate every time the address is used, so a hand-edited settings file
//! cannot point the assistant anywhere else.
//!
//! [`Settings`]: crate::settings::Settings

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct LocalModelSettings {
    /// Off by default. While on, assistant chat goes to `base_url` and nowhere
    /// else: no Vibyra service call, no tokens, no allowance.
    pub enabled: bool,
    /// An OpenAI-compatible root on this computer, e.g. `http://127.0.0.1:11434/v1`.
    pub base_url: String,
    /// The model id the endpoint listed and the person chose.
    pub model: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn missing_block_means_off_and_empty() {
        let parsed: LocalModelSettings = serde_json::from_str("{}").unwrap();
        assert_eq!(parsed, LocalModelSettings::default());
        assert!(!parsed.enabled);
    }
}
