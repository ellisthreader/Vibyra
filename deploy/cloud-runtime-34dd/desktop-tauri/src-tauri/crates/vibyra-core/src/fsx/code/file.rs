//! Reading a file for the editor and saving it back only if nobody else
//! changed it in between.

use std::io::{Read, Write};
use std::path::Path;

use super::{mtime_ms, sha256_hex, CodeFile, CodeSaved, CONFLICT_PREFIX, MAX_FILE_BYTES};
use crate::{CoreError, CoreResult};

const TOO_LARGE: &str = "This file is larger than 10 MB. Open it in another editor.";
const BINARY_PROBE: usize = 8192;

fn too_large() -> CoreError {
    CoreError::InvalidPath(TOO_LARGE.into())
}

/// All bytes of a file, refusing one past the 10 MB cap even if it grew
/// after it was measured.
pub(super) fn read_capped(path: &Path) -> CoreResult<Vec<u8>> {
    let file = std::fs::File::open(path)?;
    if file.metadata()?.len() > MAX_FILE_BYTES {
        return Err(too_large());
    }
    let mut bytes = Vec::new();
    file.take(MAX_FILE_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err(too_large());
    }
    Ok(bytes)
}

pub(super) fn looks_binary(bytes: &[u8]) -> bool {
    bytes[..bytes.len().min(BINARY_PROBE)].contains(&0)
}

/// Text for display: `None` for binary, lossy for invalid UTF-8.
pub(super) fn decode(bytes: Vec<u8>) -> (Option<String>, bool) {
    if looks_binary(&bytes) {
        return (None, false);
    }
    match String::from_utf8(bytes) {
        Ok(text) => (Some(text), false),
        Err(error) => (
            Some(String::from_utf8_lossy(error.as_bytes()).into_owned()),
            true,
        ),
    }
}

pub fn read_file(root: &Path, path: &str) -> CoreResult<CodeFile> {
    read_with_limit(root, path, super::EDIT_LIMIT_BYTES)
}

pub(super) fn read_with_limit(root: &Path, path: &str, edit_limit: u64) -> CoreResult<CodeFile> {
    let (canon_root, file) = super::scope::resolve(root, path, false)?;
    let bytes = read_capped(&file)?;
    let meta = std::fs::metadata(&file)?;
    let hash = sha256_hex(&bytes);
    let size = bytes.len() as u64;
    let (text, lossy) = decode(bytes);
    let binary = text.is_none();
    let rel = file.strip_prefix(&canon_root).unwrap_or(&file);
    Ok(CodeFile {
        path: file.to_string_lossy().into_owned(),
        rel_path: super::scope::slash_path(rel),
        text: text.unwrap_or_default(),
        hash,
        size,
        binary,
        lossy,
        // Binary text is empty: saving it would wipe the file.
        read_only: size > edit_limit || lossy || binary,
        mtime_ms: mtime_ms(&meta),
    })
}

/// The hash of the file on disk now, `None` when there is no file.
fn current_hash(path: &Path) -> CoreResult<Option<String>> {
    use sha2::{Digest, Sha256};
    let mut file = match std::fs::File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error.into()),
    };
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(Some(super::hex(&hasher.finalize())))
}

fn conflict(current: Option<&str>) -> CoreError {
    CoreError::Task(format!("{CONFLICT_PREFIX}{}", current.unwrap_or("missing")))
}

fn matches(current: Option<&str>, expected: Option<&str>) -> bool {
    match (current, expected) {
        (None, None) => true,
        (Some(now), Some(then)) => now.eq_ignore_ascii_case(then),
        _ => false,
    }
}

/// Saves `text` atomically (temp file, fsync, rename) only when the file
/// on disk still has `expected_hash` (`None`: it must not exist yet).
pub fn write_file(
    root: &Path,
    path: &str,
    text: &str,
    expected_hash: Option<&str>,
) -> CoreResult<CodeSaved> {
    if text.len() as u64 > MAX_FILE_BYTES {
        return Err(too_large());
    }
    let (_, file) = super::scope::resolve(root, path, true)?;
    let before = current_hash(&file)?;
    if !matches(before.as_deref(), expected_hash) {
        return Err(conflict(before.as_deref()));
    }
    let dir = file
        .parent()
        .ok_or_else(|| CoreError::InvalidPath("Choose a file.".into()))?;
    let name = file.file_name().unwrap_or_default().to_string_lossy();
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |since| since.as_nanos());
    let temp = dir.join(format!(".{name}.vibyra-{}-{nanos}.tmp", std::process::id()));
    let result = write_temp(&file, &temp, text.as_bytes(), before.is_some())
        .and_then(|()| commit(&file, &temp, before.as_deref()));
    if result.is_err() {
        let _ = std::fs::remove_file(&temp);
    }
    result?;
    let meta = std::fs::metadata(&file)?;
    Ok(CodeSaved {
        hash: sha256_hex(text.as_bytes()),
        size: meta.len(),
        mtime_ms: mtime_ms(&meta),
    })
}

fn write_temp(file: &Path, temp: &Path, bytes: &[u8], existed: bool) -> CoreResult<()> {
    let mut out = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(temp)?;
    out.write_all(bytes)?;
    if existed {
        // Keep the file's mode (an executable script stays executable).
        std::fs::set_permissions(temp, std::fs::metadata(file)?.permissions())?;
    }
    out.sync_all()?;
    Ok(())
}

/// Re-checks the hash right before the swap. A new file is linked into place
/// so a file created meanwhile is never overwritten.
fn commit(file: &Path, temp: &Path, before: Option<&str>) -> CoreResult<()> {
    let now = current_hash(file)?;
    if now.as_deref() != before {
        return Err(conflict(now.as_deref()));
    }
    if before.is_some() {
        std::fs::rename(temp, file)?;
        return Ok(());
    }
    match std::fs::hard_link(temp, file) {
        Ok(()) => {
            let _ = std::fs::remove_file(temp);
            Ok(())
        }
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {
            Err(conflict(current_hash(file)?.as_deref()))
        }
        // Filesystems without hard links: the check above is the guard.
        Err(_) => Ok(std::fs::rename(temp, file)?),
    }
}

#[cfg(test)]
#[path = "file_tests.rs"]
mod tests;
