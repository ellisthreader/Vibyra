use std::io::Write;
use std::path::Path;

use crate::error::CoreResult;

/// Writes owner-only bytes atomically: the data lands in a sibling temp file,
/// is flushed to the disk, then renamed over the target. A reader therefore
/// sees either the old file or the complete new one, never a truncated one.
///
/// Used for every file Vibyra owns that holds user data or credentials —
/// settings, the AI usage ledger, the saved terminal session.
pub fn write_private_atomic(path: &Path, bytes: &[u8]) -> CoreResult<()> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("vibyra");
    let temp = path.with_file_name(format!(".{file_name}.{}.tmp", std::process::id()));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(&temp)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    std::fs::rename(&temp, path)?;
    harden(path);
    Ok(())
}

/// Tightens an existing file to owner-only. Called after every write, and on
/// load, so a file created by an older build is repaired in place.
pub fn harden(path: &Path) {
    let _ = path;
    #[cfg(unix)]
    if path.exists() {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
}

/// Tightens an existing directory to owner-only.
///
/// Deliberately not `harden`: that sets 0600, and a directory without its
/// execute bit cannot be entered, so hardening a folder the way a file is
/// hardened makes everything inside it unreachable — including, in the case
/// this was written for, an already-open SQLite database.
pub fn harden_dir(path: &Path) {
    let _ = path;
    #[cfg(unix)]
    if path.is_dir() {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o700));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn replaces_content_without_leaving_a_temp_file_behind() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("thing.json");
        write_private_atomic(&path, b"first").unwrap();
        write_private_atomic(&path, b"second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
        let strays = std::fs::read_dir(dir.path()).unwrap().count();
        assert_eq!(strays, 1, "a temp file was left behind");
    }

    /// The trap this pair exists for: 0600 on a directory locks everything
    /// inside it away, so the two hardeners must not be interchangeable.
    #[cfg(unix)]
    #[test]
    fn a_hardened_directory_can_still_be_entered() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let nested = dir.path().join("private");
        std::fs::create_dir(&nested).unwrap();
        harden_dir(&nested);
        assert_eq!(
            nested.metadata().unwrap().permissions().mode() & 0o777,
            0o700
        );
        std::fs::write(nested.join("inside"), b"reachable").unwrap();
        assert_eq!(
            std::fs::read_to_string(nested.join("inside")).unwrap(),
            "reachable"
        );
    }

    #[cfg(unix)]
    #[test]
    fn the_written_file_is_owner_only() {
        use std::os::unix::fs::PermissionsExt;

        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("secret.json");
        write_private_atomic(&path, b"{}").unwrap();
        assert_eq!(path.metadata().unwrap().permissions().mode() & 0o777, 0o600);
    }
}
