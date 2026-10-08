//! The environment a server starts with: a clean allowlist plus only the
//! variables the person set for this server. The app's own environment may carry
//! provider API keys, `CLAUDE_CODE_*`, loader overrides and the AppImage capture;
//! none of it is inherited.

use super::error::McpError;
use super::spec::ServerSpec;
use std::collections::BTreeMap;
use std::path::PathBuf;

/// What a server needs to find its tools, a home and a network, and nothing else.
const ALLOWED: &[&str] = &[
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "SHELL",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TZ",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
    "REQUESTS_CA_BUNDLE",
    "XDG_CONFIG_HOME",
    "XDG_CACHE_HOME",
    "XDG_DATA_HOME",
    "SYSTEMROOT",
    "COMSPEC",
    "PATHEXT",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "PROGRAMFILES",
    "WINDIR",
];

/// The final environment, given the parent's variables (a parameter so tests
/// can prove what is and is not inherited) and the secret values just read.
pub fn build(
    spec: &ServerSpec,
    parent: &BTreeMap<String, String>,
    secrets: &BTreeMap<String, String>,
) -> Vec<(String, String)> {
    let mut env: BTreeMap<String, String> = parent
        .iter()
        .filter(|(name, _)| ALLOWED.contains(&name.as_str()))
        .map(|(k, v)| (k.clone(), v.clone()))
        .collect();
    env.extend(spec.env.iter().map(|(k, v)| (k.clone(), v.clone())));
    env.extend(secrets.iter().map(|(k, v)| (k.clone(), v.clone())));
    env.into_iter().collect()
}

pub fn parent_env() -> BTreeMap<String, String> {
    std::env::vars().collect()
}

/// Finds the program the way a shell would, on the PATH the server will get
/// (the user's login-shell PATH, installed at app start). `None` when absent.
pub fn find_program(command: &str, env: &[(String, String)]) -> Option<PathBuf> {
    let command = super::super::launch_env::resolve_program(command.trim());
    let path = std::path::Path::new(&command);
    if path.components().count() > 1 {
        return path.is_file().then(|| path.to_path_buf());
    }
    let search = env
        .iter()
        .find(|(k, _)| k == "PATH")
        .map(|(_, v)| v.as_str())?;
    std::env::split_paths(search)
        .map(|dir| dir.join(&command))
        .find(|candidate| candidate.is_file())
}

pub fn not_found(command: &str) -> McpError {
    McpError::Spawn(format!(
        "\"{command}\" was not found. Install it, or give the full path to the program."
    ))
}
