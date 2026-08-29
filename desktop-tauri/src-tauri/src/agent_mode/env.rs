//! The environment one turn runs in.
//!
//! Two jobs, and the second is the one that matters. The first is to point the
//! provider CLI at the account the user chose — the same `CODEX_HOME` /
//! `CLAUDE_CONFIG_DIR` redirect the terminals already use, so a structured
//! chat spends the credits of the login the user picked in Settings.
//!
//! The second is to make sure it can reach *nothing else*. A Codex turn has no
//! business seeing Claude's credential directory, and neither has any business
//! seeing an `OPENAI_API_KEY` the user set in their shell for something
//! unrelated. Every provider variable that is not this turn's is stripped
//! before the child exists, so a prompt-injected "print your environment"
//! finds an environment worth nothing.

use crate::provider_auth_home::DEFAULT_ACCOUNT;
use crate::provider_auth_registry::Registry;

/// Every environment variable that names a provider credential or home.
///
/// Stripped wholesale and then only this turn's is put back, rather than
/// removing "the other ones": a list of what to keep stays correct when a new
/// provider is added, and a list of what to remove does not.
const PROVIDER_VARIABLES: &[&str] = &[
    "CODEX_HOME",
    "CLAUDE_CONFIG_DIR",
    "GEMINI_CLI_HOME",
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "OPENAI_API_KEY",
    "OPENAI_BASE_URL",
    "GEMINI_API_KEY",
    "GOOGLE_API_KEY",
    "GOOGLE_APPLICATION_CREDENTIALS",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
];

/// What to set and what to strip for a turn of `engine` on `account`.
pub fn for_turn(engine: &str, account: Option<&str>) -> (Vec<(String, String)>, Vec<String>) {
    let remove: Vec<String> = PROVIDER_VARIABLES
        .iter()
        .map(|name| name.to_string())
        .collect();
    let account = account.unwrap_or(DEFAULT_ACCOUNT);
    let set = Registry::load()
        .home(engine, account)
        .ok()
        .and_then(|home| home.env())
        .map(|pair| vec![pair])
        .unwrap_or_default();
    (set, remove)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The default account keeps the CLI's own folder, so an install that
    /// never added a second login is untouched — but the sweep still runs, so
    /// a stray key in the user's shell does not reach the child.
    #[test]
    fn the_default_account_sets_nothing_and_still_strips_everything() {
        let (set, remove) = for_turn("codex", None);
        assert!(
            set.is_empty(),
            "the default account is the CLI's own folder"
        );
        for name in ["CODEX_HOME", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"] {
            assert!(
                remove.iter().any(|entry| entry == name),
                "{name} was not stripped"
            );
        }
    }

    /// A Codex turn must not be handed Claude's home, and vice versa. The
    /// sweep is what guarantees it rather than the caller remembering.
    #[test]
    fn every_provider_variable_is_stripped_whichever_engine_runs() {
        for engine in ["codex", "claude"] {
            let (_, remove) = for_turn(engine, Some("some-account"));
            for name in PROVIDER_VARIABLES {
                assert!(
                    remove.iter().any(|entry| entry == name),
                    "{engine} left {name} in the child environment"
                );
            }
        }
    }
}
