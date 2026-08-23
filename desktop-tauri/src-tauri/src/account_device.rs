use std::path::PathBuf;

use vibyra_core::settings::Settings;

/// Returns the stable per-install identifier, creating and persisting one on
/// first use. The identifier only labels this install in backend device
/// records; it is not a credential.
pub fn installation_id() -> String {
    let path = id_path();
    if let Ok(raw) = std::fs::read_to_string(&path) {
        if let Some(existing) = validate(raw.trim()) {
            return existing;
        }
    }
    let fresh = generate_id();
    persist(&path, &fresh);
    fresh
}

pub fn device_label() -> String {
    let os = match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    };
    match hostname() {
        Some(host) => format!("{host} · Vibyra Desktop ({os})"),
        None => format!("Vibyra Desktop ({os})"),
    }
}

fn hostname() -> Option<String> {
    let output = std::process::Command::new("hostname").output().ok()?;
    let name = String::from_utf8_lossy(&output.stdout).trim().to_owned();
    let safe = name.len() <= 64
        && name
            .chars()
            .all(|c| c.is_alphanumeric() || "-_.".contains(c));
    (output.status.success() && !name.is_empty() && safe).then_some(name)
}

fn id_path() -> PathBuf {
    Settings::default_path()
        .parent()
        .map(|dir| dir.join("installation-id"))
        .unwrap_or_else(|| std::env::temp_dir().join("vibyra-installation-id"))
}

fn generate_id() -> String {
    let mut bytes = [0u8; 32];
    if getrandom::fill(&mut bytes).is_err() {
        let clock = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let seed = clock ^ u128::from(std::process::id());
        bytes[..16].copy_from_slice(&seed.to_le_bytes());
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn validate(raw: &str) -> Option<String> {
    let ok = (40..=100).contains(&raw.len()) && raw.chars().all(|c| c.is_ascii_alphanumeric());
    ok.then(|| raw.to_owned())
}

fn persist(path: &PathBuf, id: &str) {
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Err(error) = std::fs::write(path, id) {
        eprintln!("Vibyra could not persist the installation id: {error}");
    } else {
        protect_installation_id(path);
    }
}

#[cfg(unix)]
fn protect_installation_id(path: &PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn protect_installation_id(_path: &PathBuf) {}

#[cfg(test)]
mod tests {
    use super::{generate_id, validate};

    #[test]
    fn generated_ids_are_stable_hex_and_unique() {
        let first = generate_id();
        let second = generate_id();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn validation_rejects_malformed_ids() {
        assert!(validate("short").is_none());
        assert!(validate(&"a".repeat(64)).is_some());
        assert!(validate(&format!("{}!", "a".repeat(63))).is_none());
    }
}
