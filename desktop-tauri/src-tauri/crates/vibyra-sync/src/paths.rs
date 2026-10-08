//! Where things live and how projects are named. Contract: "Identities".
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// `<config dir>/vibyra-desktop`, the app's own folder (override with `VIBYRA_SYNC_STATE_DIR`).
pub fn default_state_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("VIBYRA_SYNC_STATE_DIR").map(PathBuf::from) {
        if dir.is_absolute() {
            return dir;
        }
    }
    dirs::config_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("vibyra-desktop")
}

/// 32 lowercase hex = first 32 hex chars of `sha256("vibyra-project:" + id)`.
pub fn project_key(project_id: &str) -> String {
    let digest = Sha256::digest(format!("vibyra-project:{project_id}").as_bytes());
    crate::crypto::hex(&digest)[..32].to_string()
}

/// The Mac's proposed cloud folder name: `[a-z0-9_-]`, at most 40 characters, never empty.
pub fn slug(name: &str) -> String {
    let mut out = String::new();
    for c in name.trim().chars() {
        let c = c.to_ascii_lowercase();
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' {
            out.push(c);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    let out: String = out.trim_matches('-').chars().take(40).collect();
    if out.is_empty() {
        "project".into()
    } else {
        out
    }
}

/// `<state dir>/cloud-sync`
pub fn sync_root(state_dir: &Path) -> PathBuf {
    state_dir.join("cloud-sync")
}

/// `<state dir>/cloud-sync/<projectKey>`
pub fn project_dir(state_dir: &Path, key: &str) -> PathBuf {
    sync_root(state_dir).join(key)
}

/// `<state dir>/cloud-sync/<projectKey>/shadow.git`
pub fn shadow_dir(state_dir: &Path, key: &str) -> PathBuf {
    project_dir(state_dir, key).join("shadow.git")
}

/// Scratch space for bundles and sealed files, per project.
pub fn tmp_dir(state_dir: &Path, key: &str) -> PathBuf {
    project_dir(state_dir, key).join("tmp")
}
