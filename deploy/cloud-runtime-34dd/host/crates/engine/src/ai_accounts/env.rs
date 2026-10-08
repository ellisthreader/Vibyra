//! How a provider CLI is found and started on this computer: by name on PATH,
//! as the Host's own user, with every credential-shaped variable removed so an
//! inherited key can never be what signs the account in.
use std::{
    ffi::OsString,
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Clone, Default)]
pub(super) struct Env {
    /// Replaces `$PATH` for lookup and for the child (tests; otherwise unset).
    path: Option<OsString>,
    /// Replaces `$HOME` for the child and is its working folder.
    home: Option<PathBuf>,
}

impl Env {
    #[cfg(test)]
    pub fn with(path: OsString, home: PathBuf) -> Self {
        Self {
            path: Some(path),
            home: Some(home),
        }
    }

    pub fn find(&self, program: &str) -> Option<PathBuf> {
        let paths = self.path.clone().or_else(|| std::env::var_os("PATH"))?;
        std::env::split_paths(&paths)
            .map(|dir| dir.join(program))
            .find(|candidate| is_executable(candidate))
    }

    /// `program` ready to run: resolved, cleaned, in the user's home folder.
    pub fn command(&self, program: &Path) -> Command {
        let mut command = Command::new(program);
        for (key, _) in std::env::vars_os() {
            if is_credential_name(&key.to_string_lossy()) {
                command.env_remove(key);
            }
        }
        if let Some(path) = &self.path {
            command.env("PATH", path);
        }
        if let Some(home) = &self.home {
            command.env("HOME", home);
        }
        let home = self.home.clone().or_else(dirs::home_dir);
        if let Some(home) = home.filter(|home| home.is_dir()) {
            command.current_dir(home);
        }
        command
    }
}

#[cfg(unix)]
fn is_executable(path: &Path) -> bool {
    use std::os::unix::fs::PermissionsExt;
    path.metadata()
        .is_ok_and(|meta| meta.is_file() && meta.permissions().mode() & 0o111 != 0)
}

#[cfg(not(unix))]
fn is_executable(path: &Path) -> bool {
    path.is_file()
}

/// API keys, tokens and other secrets by their conventional suffix. Includes
/// `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CODEX_API_KEY`, `OPENROUTER_API_KEY`
/// and `CLAUDE_CODE_OAUTH_TOKEN`, the ones the terminals also strip.
pub(super) fn is_credential_name(name: &str) -> bool {
    let name = name.to_ascii_uppercase();
    [
        "_API_KEY",
        "_ACCESS_KEY_ID",
        "_SECRET_ACCESS_KEY",
        "_ACCESS_TOKEN",
        "_AUTH_TOKEN",
        "_SESSION_TOKEN",
        "_REFRESH_TOKEN",
        "_TOKEN",
        "_SECRET",
        "_PASSWORD",
        "_PRIVATE_KEY",
        "_CREDENTIALS",
    ]
    .iter()
    .any(|suffix| name.ends_with(suffix))
}
