//! The plaintext artifact: a ustar tar holding exactly `codex/auth.json`.
use crate::error::{Result, SyncError};
use std::io::Read;

pub const CODEX_ENTRY: &str = "codex/auth.json";
/// Claude's long-lived token (`claude setup-token`), made on this Mac only for Vibyra Cloud.
pub const CLAUDE_ENTRY: &str = "claude/oauth-token";

/// Packs the login bytes (already checked by `CodexSource::read`) into the one-entry tar.
pub fn pack_codex(contents: &[u8]) -> Result<Vec<u8>> {
    pack_entry(CODEX_ENTRY, contents)
}

/// One regular file `name` (0600, mtime 0) in a ustar tar: the whole plaintext artifact.
pub fn pack_entry(name: &str, contents: &[u8]) -> Result<Vec<u8>> {
    let mut tar = tar::Builder::new(Vec::with_capacity(contents.len() + 2048));
    let mut head = tar::Header::new_ustar();
    head.set_size(contents.len() as u64);
    head.set_mode(0o600);
    head.set_mtime(0);
    tar.append_data(&mut head, name, contents)?;
    Ok(tar.into_inner()?)
}

/// The receiving side's check, used by tests: exactly one regular entry named `codex/auth.json`.
pub fn unpack_codex(tar_bytes: &[u8]) -> Result<Vec<u8>> {
    let bad = || SyncError::Invalid("The login archive is not the expected single file.".into());
    let mut archive = tar::Archive::new(tar_bytes);
    let mut found = None;
    for entry in archive.entries().map_err(|_| bad())? {
        let mut entry = entry.map_err(|_| bad())?;
        let name = entry
            .path()
            .map_err(|_| bad())?
            .to_string_lossy()
            .into_owned();
        if found.is_some() || name != CODEX_ENTRY || !entry.header().entry_type().is_file() {
            return Err(bad());
        }
        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|_| bad())?;
        found = Some(data);
    }
    found.ok_or_else(bad)
}
