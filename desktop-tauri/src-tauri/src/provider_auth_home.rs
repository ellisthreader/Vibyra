//! Where each account's credentials live, and the one environment variable
//! that points its CLI at them.
//!
//! Every provider CLI keeps its sign-in in a directory, and every one of them
//! lets that directory be moved by an environment variable. That is the whole
//! mechanism behind holding more than one account: a second login is a second
//! directory, and a terminal runs as whichever account its environment names.
//!
//! Verified against the installed CLIs on 2026-08-22 — each was pointed at a
//! fresh directory and reported *not signed in* while the real home stayed
//! signed in:
//!
//! | CLI    | Variable            | What it names                             |
//! |--------|---------------------|-------------------------------------------|
//! | codex  | `CODEX_HOME`        | the credential directory itself           |
//! | claude | `CLAUDE_CONFIG_DIR` | the config directory itself               |
//! | gemini | `GEMINI_CLI_HOME`   | the **parent**; the CLI appends `.gemini` |
//!
//! Gemini's asymmetry is the trap here, and it is why `credentials_dir` and
//! `env` are two different answers rather than one.

use std::path::{Path, PathBuf};

/// The account every existing install already has.
///
/// It deliberately carries **no** directory: it is whatever the CLI would use
/// on its own (`~/.codex`, `~/.claude`, `~/.gemini`). Adding accounts is
/// therefore purely additive — the login the user already had keeps working
/// against the same files, and nothing has to be migrated to reach it.
pub const DEFAULT_ACCOUNT: &str = "default";

/// One account's place on disk.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AccountHome {
    provider: String,
    id: String,
    /// `None` for the default account, which uses the CLI's own location.
    root: Option<PathBuf>,
}

impl AccountHome {
    /// Points an account at an explicit tree rather than the user's own —
    /// the same escape hatch `ConversationStore::rooted_at` gives its tests.
    pub fn rooted(provider: &str, id: &str, root: Option<PathBuf>) -> Self {
        Self {
            provider: provider.to_string(),
            id: id.to_string(),
            root,
        }
    }

    /// The variable that points this account's CLI at it, or `None` for the
    /// default account, which needs no redirect.
    pub fn env(&self) -> Option<(String, String)> {
        let root = self.root.as_ref()?;
        let name = env_name(&self.provider)?;
        Some((name.to_string(), root.to_string_lossy().into_owned()))
    }

    /// Where the credentials actually land — which is *not* what `env` names
    /// for Gemini, because its CLI appends `.gemini` to the path it is given.
    pub fn credentials_dir(&self) -> PathBuf {
        match &self.root {
            Some(root) if self.provider == "gemini" => root.join(".gemini"),
            Some(root) => root.clone(),
            None => default_credentials_dir(&self.provider),
        }
    }

    /// Creates the directory the CLI is about to write into.
    ///
    /// Owner-only: these hold live OAuth tokens, and on this platform Claude
    /// keeps them in a plain file because libsecret is unavailable.
    pub fn ensure(&self) -> Result<(), String> {
        let Some(root) = &self.root else {
            return Ok(());
        };
        let dir = self.credentials_dir();
        std::fs::create_dir_all(&dir)
            .map_err(|error| format!("Could not create the account folder: {error}"))?;
        harden_dir(&dir);
        harden_dir(root);
        Ok(())
    }
}

fn env_name(provider: &str) -> Option<&'static str> {
    match provider {
        "codex" => Some("CODEX_HOME"),
        "claude" => Some("CLAUDE_CONFIG_DIR"),
        "gemini" => Some("GEMINI_CLI_HOME"),
        _ => None,
    }
}

fn default_credentials_dir(provider: &str) -> PathBuf {
    let home = dirs::home_dir().unwrap_or_else(std::env::temp_dir);
    let inherited = env_name(provider)
        .and_then(std::env::var_os)
        .filter(|value| !value.is_empty())
        .map(PathBuf::from);
    match provider {
        // Gemini names a parent, so an inherited value cannot be used as the
        // credential folder the way the other two can.
        "gemini" => inherited.unwrap_or_else(|| home.clone()).join(".gemini"),
        "codex" => inherited.unwrap_or_else(|| home.join(".codex")),
        _ => inherited.unwrap_or_else(|| home.join(".claude")),
    }
}

/// Managed accounts live beside the settings file rather than in the CLI's own
/// directory, so uninstalling a CLI never strips an account and the whole set
/// moves with the user's config.
///
/// Refused outright when there is no config directory to use. The fallback
/// would be a temporary one, and Codex declines to run at all with
/// `CODEX_HOME` under temp — it will not create its helper binaries there. An
/// error the user can read beats a sign-in that half-works.
pub fn accounts_root() -> Result<PathBuf, String> {
    let config = dirs::config_dir().ok_or_else(|| {
        "No configuration folder is available to keep extra accounts in.".to_string()
    })?;
    Ok(config.join("vibyra-desktop").join("accounts"))
}

fn harden_dir(path: &Path) {
    let _ = path;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700));
    }
}

#[cfg(test)]
#[path = "provider_auth_home_tests.rs"]
mod tests;
