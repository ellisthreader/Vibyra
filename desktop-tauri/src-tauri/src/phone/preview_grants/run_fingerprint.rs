//! What a desktop run approval covers: the command, the script bodies it runs,
//! the manifests that decide what those tools do, and every project file the
//! scripts name. Changing any of them asks the owner again.

use super::fingerprint::read_source;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use vibyra_core::preview::{DesktopCommand, PreviewTarget};

const MANIFESTS: [&str; 9] = [
    "package.json",
    "Cargo.toml",
    ".cargo/config.toml",
    "tauri.conf.json",
    "Tauri.toml",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    "src-tauri/tauri.conf.json5",
    "src-tauri/Tauri.toml",
];
/// Named scripts that call further scripts (`npm run a && npm run b`).
const MAX_DEPTH: usize = 4;
const MAX_FILES: usize = 48;

pub(crate) fn run_fingerprint(
    canonical_root: &Path,
    target: &PreviewTarget,
    command: Option<&DesktopCommand>,
) -> Result<String, String> {
    let app = canonical_root
        .join(&target.relative_root)
        .canonicalize()
        .map_err(|e| e.to_string())?;
    if !app.starts_with(canonical_root) || !app.is_dir() {
        return Err("The app moved outside its project".into());
    }
    let mut files = BTreeMap::new();
    for name in MANIFESTS {
        files.insert(name.to_owned(), read_source(&app.join(name))?);
    }
    let scripts = files["package.json"]
        .as_deref()
        .and_then(|text| serde_json::from_str::<Value>(text).ok())
        .and_then(|value| value.get("scripts").cloned())
        .unwrap_or(Value::Null);
    let mut words = target
        .command
        .iter()
        .flat_map(|text| text.split_whitespace())
        .chain(
            command
                .into_iter()
                .flat_map(|c| c.argv.iter().map(String::as_str)),
        )
        .map(str::to_owned)
        .collect::<Vec<_>>();
    // Follow scripts that run scripts, so every body that runs is covered.
    let mut expanded = 0;
    for _ in 0..MAX_DEPTH {
        let bodies = words[expanded..]
            .iter()
            .filter_map(|word| scripts.get(word).and_then(Value::as_str))
            .flat_map(|body| body.split_whitespace().map(str::to_owned))
            .collect::<Vec<_>>();
        expanded = words.len();
        if bodies.is_empty() {
            break;
        }
        words.extend(bodies);
    }
    for word in &words {
        if files.len() >= MANIFESTS.len() + MAX_FILES {
            break;
        }
        if let Some(path) = project_file(canonical_root, &app, word) {
            let key = path.strip_prefix(canonical_root).unwrap_or(&path);
            let key = key.to_string_lossy().replace('\\', "/");
            files.insert(key, Some(hash_file(&path)?));
        }
    }
    let document = serde_json::to_vec(&(target, command, files)).map_err(|e| e.to_string())?;
    let digest = Sha256::digest(document);
    Ok(digest.iter().map(|byte| format!("{byte:02x}")).collect())
}

/// Named files can be large or binary (a built sidecar): hashed, not read whole.
fn hash_file(path: &Path) -> Result<String, String> {
    use std::io::Read;
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let length = file.metadata().map_err(|e| e.to_string())?.len();
    let mut digest = Sha256::new();
    let mut limited = file.take(8 * 1024 * 1024);
    std::io::copy(&mut limited, &mut digest).map_err(|e| e.to_string())?;
    let hash = digest
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    Ok(format!("{length}:{hash}"))
}

/// A word that names a regular file inside the project, such as
/// `scripts/dev.mjs` or `software/desktop/Cargo.toml`.
fn project_file(root: &Path, app: &Path, word: &str) -> Option<PathBuf> {
    let word = word.trim_matches(['"', '\'']);
    if word.is_empty() || word.starts_with('-') || !word.contains(['/', '.']) {
        return None;
    }
    let path = app.join(word).canonicalize().ok()?;
    (path.starts_with(root) && path.is_file()).then_some(path)
}
