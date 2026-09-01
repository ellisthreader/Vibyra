mod private;
mod watch;
mod watch_tree;

pub use private::{harden, harden_dir, write_private_atomic};
pub use watch::{FsChange, WorkspaceWatcher};

use std::path::Path;
use std::time::UNIX_EPOCH;

use serde::Serialize;

use crate::error::{CoreError, CoreResult};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DirEntryInfo {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FilePreview {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub truncated: bool,
}

/// Lists a directory, directories first then files, both alphabetical
/// (case-insensitive). Dotfiles are included only when `show_hidden`.
pub fn list_dir(path: &str, show_hidden: bool) -> CoreResult<Vec<DirEntryInfo>> {
    let dir = Path::new(path);
    if !dir.is_dir() {
        return Err(CoreError::InvalidPath(format!("not a directory: {path}")));
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !show_hidden && name.starts_with('.') {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        let modified_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        entries.push(DirEntryInfo {
            path: entry.path().to_string_lossy().into_owned(),
            is_dir: metadata.is_dir(),
            size: metadata.len(),
            modified_ms,
            name,
        });
    }
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(entries)
}

/// Reads up to `max_bytes` of a file as lossy UTF-8 for previewing.
pub fn read_file_preview(path: &str, max_bytes: usize) -> CoreResult<FilePreview> {
    use std::io::Read;
    let file_path = Path::new(path);
    if !file_path.is_file() {
        return Err(CoreError::InvalidPath(format!("not a file: {path}")));
    }
    let size = file_path.metadata()?.len();
    let mut buf = Vec::with_capacity(max_bytes.min(size as usize + 1));
    std::fs::File::open(file_path)?
        .take(max_bytes as u64)
        .read_to_end(&mut buf)?;
    Ok(FilePreview {
        path: path.to_string(),
        content: String::from_utf8_lossy(&buf).into_owned(),
        size,
        truncated: (buf.len() as u64) < size,
    })
}

pub fn home_dir() -> String {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().into_owned())
        .unwrap_or_else(|| "/".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lists_dirs_first_and_respects_hidden_flag() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir(tmp.path().join("zdir")).unwrap();
        std::fs::write(tmp.path().join("afile.txt"), "hi").unwrap();
        std::fs::write(tmp.path().join(".hidden"), "x").unwrap();

        let visible = list_dir(tmp.path().to_str().unwrap(), false).unwrap();
        assert_eq!(
            visible.iter().map(|e| e.name.as_str()).collect::<Vec<_>>(),
            vec!["zdir", "afile.txt"]
        );

        let all = list_dir(tmp.path().to_str().unwrap(), true).unwrap();
        assert!(all.iter().any(|e| e.name == ".hidden"));
    }

    #[test]
    fn preview_truncates_large_files() {
        let tmp = tempfile::tempdir().unwrap();
        let path = tmp.path().join("big.txt");
        std::fs::write(&path, "abcdefghij").unwrap();
        let preview = read_file_preview(path.to_str().unwrap(), 4).unwrap();
        assert_eq!(preview.content, "abcd");
        assert!(preview.truncated);
        assert_eq!(preview.size, 10);
    }
}
