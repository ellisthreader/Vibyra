use std::collections::HashSet;
use std::path::{Path, PathBuf};

/// Per-user tool directories that a **desktop** launch never inherits.
///
/// A GUI launch gets the session manager's PATH, which is built from
/// `~/.profile` at login. Node tooling installs into `~/.npm-global/bin` (or a
/// Volta/Bun/Yarn equivalent) and is put on PATH by `~/.bashrc` or `~/.zshrc`,
/// which only *interactive* shells read. So `claude`, `codex` and `gemini` are
/// on PATH in the user's terminal and absent from the app started off the dock
/// — and every one of them then reports as "not installed".
const USER_BIN_DIRS: &[&str] = &[
    ".npm-global/bin",
    ".local/bin",
    ".local/share/npm/bin",
    "bin",
    ".yarn/bin",
    ".config/yarn/global/node_modules/.bin",
    ".bun/bin",
    ".deno/bin",
    ".volta/bin",
    ".cargo/bin",
    "go/bin",
    ".pyenv/shims",
    ".rbenv/shims",
];

/// Machine-wide directories a stripped session PATH can also be missing.
const SYSTEM_BIN_DIRS: &[&str] = &["/usr/local/bin", "/opt/homebrew/bin", "/snap/bin"];

/// Directories that exist on this machine, in the order they should be tried.
pub fn candidates(home: &Path) -> Vec<String> {
    USER_BIN_DIRS
        .iter()
        .map(|dir| home.join(dir))
        .chain(SYSTEM_BIN_DIRS.iter().map(PathBuf::from))
        .filter(|dir| dir.is_dir())
        .map(|dir| dir.to_string_lossy().into_owned())
        .collect()
}

/// Union of the three sources, first occurrence wins.
///
/// `discovered` leads deliberately: it is the PATH the user's own terminal
/// has, and a CLI Vibyra runs should be the same binary the user runs. What
/// `current` uniquely contributes — the AppImage's bundled `usr/bin` — must
/// not shadow the user's tools, so it follows rather than leads.
pub fn merge(current: &str, discovered: &str, extras: &[String]) -> String {
    let extras: Vec<&str> = extras.iter().map(String::as_str).collect();
    let mut seen: HashSet<String> = HashSet::new();
    let mut merged: Vec<String> = Vec::new();
    for source in [
        discovered.split(':').collect::<Vec<_>>(),
        current.split(':').collect::<Vec<_>>(),
        extras,
    ] {
        for entry in source {
            let entry = normalize(entry);
            if entry.is_empty() || !seen.insert(entry.clone()) {
                continue;
            }
            merged.push(entry);
        }
    }
    merged.join(":")
}

/// `/usr/bin/` and `/usr/bin` are one directory. Bare `/` keeps its slash.
fn normalize(entry: &str) -> String {
    let trimmed = entry.trim_end_matches('/');
    if trimmed.is_empty() {
        entry.to_owned()
    } else {
        trimmed.to_owned()
    }
}

/// Pulls `$PATH` out of a login shell's (possibly noisy) output. The markers
/// exist because rc files print banners, and `-i` makes some shells warn about
/// job control on a pipe.
pub fn extract(output: &str) -> Option<&str> {
    let start = output.find(super::START)? + super::START.len();
    let rest = &output[start..];
    let end = rest.find(super::END)?;
    let value = rest[..end].trim();
    (!value.is_empty()).then_some(value)
}

/// Resolves the PATH the user's own terminal has and installs it on this
/// process, so `program_in_path` and every `Command` Vibyra spawns agree with
/// what the user sees when they type the same name.
///
/// Returns the installed value. Safe to call more than once: `merge` is
/// idempotent.
pub fn install() -> String {
    let current = std::env::var("PATH").unwrap_or_default();
    let discovered = discover().unwrap_or_default();
    let extras = dirs::home_dir()
        .map(|home| candidates(&home))
        .unwrap_or_default();
    let merged = merge(&current, &discovered, &extras);
    std::env::set_var("PATH", &merged);
    merged
}

#[cfg(unix)]
fn discover() -> Option<String> {
    super::probe::login_shell_path()
}

/// Windows has no login-shell concept: a GUI process already receives the same
/// PATH a console does, assembled from the registry.
#[cfg(not(unix))]
fn discover() -> Option<String> {
    None
}

#[cfg(test)]
#[path = "user_path_tests.rs"]
mod tests;
