use crate::{state::Project, text};
use cap_std::fs::OpenOptions;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    io::{Read, Seek, SeekFrom, Write},
    path::{Component, Path},
};

pub(crate) fn write(project: &Project, p: &Value) -> Result<Value, String> {
    let path = Path::new(text(p, "path")?);
    if path.as_os_str().is_empty()
        || path
            .components()
            .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("Use a file path inside the authorized project".into());
    }
    let content = text(p, "content")?;
    if content.len() > 8192 || content.contains('\0') {
        return Err("AI writes are limited to 8 KB of text".into());
    }
    let expected = text(p, "expectedSha256")?;
    let parent = path.parent().unwrap_or(Path::new(""));
    // Refuse symlinks in every component before opening the capability-relative parent.
    let mut prefix = std::path::PathBuf::new();
    for component in path.components() {
        prefix.push(component);
        if let Ok(m) = project.directory.symlink_metadata(&prefix) {
            if m.is_symlink() {
                return Err("AI writes cannot follow symbolic links".into());
            }
        }
    }
    let dir = project
        .directory
        .open_dir(if parent.as_os_str().is_empty() {
            Path::new(".")
        } else {
            parent
        })
        .map_err(|e| e.to_string())?;
    let name = path.file_name().ok_or("Missing filename")?;
    let mut options = OpenOptions::new();
    options.read(true).write(true);
    #[cfg(unix)]
    {
        use cap_std::fs::OpenOptionsExt;
        options.custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK);
    }
    if expected == "new" {
        options.create_new(true);
    }
    let mut file = dir
        .open_with(name, &options)
        .map_err(|e| e.to_string())?
        .into_std();
    let meta = file.metadata().map_err(|e| e.to_string())?;
    if !meta.is_file() {
        return Err("Only regular text files can be changed".into());
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;
        if meta.nlink() != 1 {
            return Err("AI writes cannot change hard-linked files".into());
        }
    }
    fs2::FileExt::try_lock_exclusive(&file).map_err(|_| "File is busy")?;
    if expected != "new" {
        if meta.len() > 8192 {
            return Err("Read and edit a smaller file".into());
        }
        let mut before = Vec::new();
        Read::by_ref(&mut file)
            .take(8193)
            .read_to_end(&mut before)
            .map_err(|e| e.to_string())?;
        if format!("{:x}", Sha256::digest(&before)) != expected {
            return Err("File changed since it was read. Read it again before editing".into());
        }
    }
    file.seek(SeekFrom::Start(0)).map_err(|e| e.to_string())?;
    file.write_all(content.as_bytes())
        .map_err(|e| e.to_string())?;
    file.set_len(content.len() as u64)
        .map_err(|e| e.to_string())?;
    file.sync_all().map_err(|e| e.to_string())?;
    Ok(
        json!({"written":true,"path":text(p,"path")?,"sha256":format!("{:x}",Sha256::digest(content.as_bytes()))}),
    )
}
