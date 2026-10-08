//! A local MCP server as the person configured it. Secret values are never part
//! of this model: `secret_env` holds variable NAMES only, the values live in the
//! operating-system credential store.

use super::error::McpError;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct ServerSpec {
    /// Opaque, random, local. The keychain account names derive from it.
    pub id: String,
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
    /// Non-secret variables, shown as written in the consent step.
    pub env: BTreeMap<String, String>,
    /// Names whose values are in the keychain.
    pub secret_env: Vec<String>,
    pub enabled: bool,
    pub timeout_secs: Option<u64>,
    /// The backend's connection id once the catalogue is registered (opaque).
    pub connection_id: Option<String>,
    /// Starter preset this came from, for the pinned-launcher note only.
    pub preset: Option<String>,
}

const MAX_ENV: usize = 40;

/// Variables that would let a server load code into the app's other processes
/// or impersonate the app. Everything else the person types is theirs to set.
pub fn forbidden_env(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    upper.starts_with("VIBYRA_")
        || upper.starts_with("CLAUDE_CODE_")
        || upper == "CLAUDECODE"
        || upper.starts_with("LD_")
        || upper.starts_with("DYLD_")
}

fn env_name_ok(name: &str) -> bool {
    let mut chars = name.chars();
    name.len() <= 100
        && chars
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic() || c == '_')
        && chars.all(|c| c.is_ascii_alphanumeric() || c == '_')
}

fn plain(text: &str, max: usize) -> bool {
    !text.is_empty() && text.len() <= max && !text.contains(['\0', '\n', '\r'])
}

impl ServerSpec {
    pub fn validate(&self) -> Result<(), McpError> {
        let bad = |why: &str| Err(McpError::Invalid(why.to_owned()));
        if !(8..=64).contains(&self.id.len())
            || !self
                .id
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-')
        {
            return bad("The server needs an id.");
        }
        if !plain(self.name.trim(), 80) {
            return bad("Give the server a name of up to 80 characters.");
        }
        if !plain(self.command.trim(), 500) {
            return bad("Give the command that starts the server.");
        }
        if self.args.len() > 64 || self.args.iter().any(|a| a.len() > 4096 || a.contains('\0')) {
            return bad("The server has too many or too long arguments.");
        }
        if let Some(cwd) = &self.cwd {
            if !plain(cwd, 1024) || !std::path::Path::new(cwd).is_absolute() {
                return bad("The working folder must be a full path.");
            }
        }
        if self.env.len() + self.secret_env.len() > MAX_ENV {
            return bad("Too many environment variables.");
        }
        let names = self.env.keys().chain(self.secret_env.iter());
        for name in names.clone() {
            if !env_name_ok(name) || forbidden_env(name) {
                return Err(McpError::Invalid(format!(
                    "{name} cannot be used as an environment variable name."
                )));
            }
        }
        let mut seen = std::collections::HashSet::new();
        if !names
            .into_iter()
            .all(|n| seen.insert(n.to_ascii_uppercase()))
        {
            return bad("A variable is listed twice.");
        }
        if self
            .env
            .values()
            .any(|v| v.len() > 4096 || v.contains('\0'))
        {
            return bad("An environment value is too long.");
        }
        if self.timeout_secs.is_some_and(|t| t == 0 || t > 300) {
            return bad("The time limit is 1 to 300 seconds.");
        }
        Ok(())
    }

    /// True for launchers that fetch and run code from a registry at start
    /// without a pinned version: `npx -y pkg`, `uvx pkg`, `bunx`, `pnpm dlx`.
    pub fn unpinned_launcher(&self) -> bool {
        let program = std::path::Path::new(self.command.trim())
            .file_stem()
            .map(|s| s.to_string_lossy().to_ascii_lowercase())
            .unwrap_or_default();
        let fetches = matches!(program.as_str(), "npx" | "uvx" | "bunx" | "pnpx")
            || (matches!(program.as_str(), "pnpm" | "yarn")
                && self.args.first().is_some_and(|a| a == "dlx"))
            || (program == "uv" && self.args.first().is_some_and(|a| a == "tool"));
        if !fetches {
            return false;
        }
        !self.launched_package().is_some_and(pinned)
    }

    /// The package a fetching launcher runs: `--from X`, else the first plain
    /// argument (skipping flags and the values of `--with` and friends).
    fn launched_package(&self) -> Option<&str> {
        const TAKES_VALUE: [&str; 6] = [
            "--with",
            "--python",
            "-p",
            "--directory",
            "--with-requirements",
            "-w",
        ];
        let mut args = self.args.iter().map(String::as_str);
        while let Some(arg) = args.next() {
            if arg == "--from" {
                return args.next();
            }
            if TAKES_VALUE.contains(&arg) {
                args.next();
            } else if !arg.starts_with('-') && !matches!(arg, "dlx" | "tool" | "run") {
                return Some(arg);
            }
        }
        None
    }
}

/// `pkg@1.2.3`, `@scope/pkg@1.2.3` or `pkg==1.2.3`.
fn pinned(package: &str) -> bool {
    let version = if let Some((_, v)) = package.split_once("==") {
        v
    } else {
        match package.trim_start_matches('@').rsplit_once('@') {
            Some((_, v)) => v,
            None => return false,
        }
    };
    version.chars().next().is_some_and(|c| c.is_ascii_digit())
        && !version.contains(['^', '~', '*', 'x'])
}
