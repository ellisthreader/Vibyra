//! Writes git loose blobs directly: the very bytes that were scanned are the bytes stored, nothing is
//! re-read from disk and no content filter can run.
use crate::error::{Result, SyncError};
use flate2::{write::ZlibEncoder, Compression};
use sha1::{Digest, Sha1};
use std::io::Write;
use std::path::Path;

pub fn blob_sha(bytes: &[u8]) -> String {
    let mut h = Sha1::new();
    h.update(format!("blob {}\0", bytes.len()).as_bytes());
    h.update(bytes);
    crate::crypto::hex(&h.finalize())
}

/// Stores `bytes` as a loose blob in `objects_dir` (no-op if present) and returns its sha-1.
pub fn write_blob(objects_dir: &Path, bytes: &[u8]) -> Result<String> {
    let sha = blob_sha(bytes);
    let dir = objects_dir.join(&sha[..2]);
    let dest = dir.join(&sha[2..]);
    if dest.exists() {
        return Ok(sha);
    }
    std::fs::create_dir_all(&dir)?;
    let tmp = dir.join(format!("tmp_{}", uuid::Uuid::new_v4().simple()));
    let mut enc = ZlibEncoder::new(std::fs::File::create(&tmp)?, Compression::fast());
    let written = enc
        .write_all(format!("blob {}\0", bytes.len()).as_bytes())
        .and_then(|_| enc.write_all(bytes))
        .and_then(|_| enc.finish().map(|_| ()));
    if let Err(e) = written {
        let _ = std::fs::remove_file(&tmp);
        return Err(SyncError::Io(format!("could not store an object: {e}")));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o444));
    }
    std::fs::rename(&tmp, &dest).map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        SyncError::Io(format!("could not store an object: {e}"))
    })?;
    Ok(sha)
}
