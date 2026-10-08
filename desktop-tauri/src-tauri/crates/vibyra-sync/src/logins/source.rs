//! Where the Codex login lives and how it is read safely.
use crate::error::{Result, SyncError};
use std::ffi::OsString;
use std::io::Read;
use std::path::{Path, PathBuf};

/// Larger files are refused (a real `auth.json` is a few KiB).
pub const MAX_LOGIN_BYTES: u64 = 64 * 1024;

/// A login file location: a trusted `root` (canonicalised, so system links such as `/tmp` are fine) plus the
/// components below it, none of which may be a symbolic link.
#[derive(Debug, Clone)]
pub struct CodexSource {
    root: PathBuf,
    rel: Vec<OsString>,
}

impl CodexSource {
    /// `<home>/.codex/auth.json`
    pub fn in_home(home: &Path) -> CodexSource {
        CodexSource {
            root: home.to_path_buf(),
            rel: vec![".codex".into(), "auth.json".into()],
        }
    }

    /// `<codex_home>/auth.json`; `codex_home` itself must not be a symbolic link.
    pub fn in_codex_home(codex_home: &Path) -> Option<CodexSource> {
        let name = codex_home.file_name()?.to_os_string();
        Some(CodexSource {
            root: codex_home.parent()?.to_path_buf(),
            rel: vec![name, "auth.json".into()],
        })
    }

    /// `$CODEX_HOME/auth.json` (an absolute `CODEX_HOME`), else `~/.codex/auth.json`. Only the location is
    /// resolved here; nothing is read until `read`.
    pub fn from_environment() -> Option<CodexSource> {
        if let Some(dir) = std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .filter(|d| d.is_absolute())
        {
            return CodexSource::in_codex_home(&dir);
        }
        dirs::home_dir().map(|h| CodexSource::in_home(&h))
    }

    /// The file's path, for messages (a path is not a secret).
    pub fn path(&self) -> PathBuf {
        self.rel.iter().fold(self.root.clone(), |p, c| p.join(c))
    }

    /// The file's bytes, `Ok(None)` when Codex is not signed in (no file). Refuses a symbolic link anywhere
    /// below the root, anything but a regular file, over 64 KiB, and anything that is not a JSON object.
    /// Errors never include the contents.
    pub fn read(&self) -> Result<Option<Vec<u8>>> {
        let mut cur = match std::fs::canonicalize(&self.root) {
            Ok(p) => p,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(_) => return Err(refuse("its folder cannot be read")),
        };
        let mut last = None;
        for (i, part) in self.rel.iter().enumerate() {
            cur.push(part);
            match std::fs::symlink_metadata(&cur) {
                Ok(md) if md.file_type().is_symlink() => {
                    return Err(refuse("it is behind a symbolic link"))
                }
                Ok(md) if i + 1 < self.rel.len() && !md.is_dir() => {
                    return Err(refuse("its folder is not a folder"))
                }
                Ok(md) => last = Some(md),
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(None),
                Err(_) => return Err(refuse("it cannot be read")),
            }
        }
        let Some(md) = last else { return Ok(None) };
        if !md.is_file() {
            return Err(refuse("it is not a regular file"));
        }
        if md.len() > MAX_LOGIN_BYTES {
            return Err(refuse("it is larger than 64 KiB"));
        }
        let file = std::fs::File::open(&cur).map_err(|_| refuse("it cannot be opened"))?;
        let opened = file.metadata().map_err(|_| refuse("it cannot be read"))?;
        if !same_file(&md, &opened) {
            return Err(refuse("it changed while it was being read"));
        }
        let mut bytes = Vec::new();
        file.take(MAX_LOGIN_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| refuse("it cannot be read"))?;
        if bytes.len() as u64 > MAX_LOGIN_BYTES {
            return Err(refuse("it is larger than 64 KiB"));
        }
        match serde_json::from_slice::<serde_json::Value>(&bytes) {
            Ok(v) if v.is_object() => Ok(Some(bytes)),
            _ => Err(refuse("it is not a JSON object")),
        }
    }
}

#[cfg(unix)]
fn same_file(a: &std::fs::Metadata, b: &std::fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    a.dev() == b.dev() && a.ino() == b.ino()
}

#[cfg(not(unix))]
fn same_file(_: &std::fs::Metadata, _: &std::fs::Metadata) -> bool {
    true
}

fn refuse(why: &str) -> SyncError {
    SyncError::Invalid(format!("Codex's login file is not used: {why}."))
}
