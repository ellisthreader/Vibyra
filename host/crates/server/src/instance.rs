use fs2::FileExt;
use std::{fs, path::Path};

/// An OS-owned advisory lock is released even after a crash; stale files are harmless.
pub fn lock(directory: &Path) -> Result<fs::File, String> {
    fs::create_dir_all(directory).map_err(|e| e.to_string())?;
    let mut options = fs::OpenOptions::new();
    options.read(true).write(true).create(true).truncate(false);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let file = options
        .open(directory.join("host.lock"))
        .map_err(|e| e.to_string())?;
    file.try_lock_exclusive()
        .map_err(|_| "A Vibyra Host is already using this state directory")?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    #[test]
    fn rejects_second_host_and_releases_after_owner_exits() {
        let dir = tempfile::tempdir().unwrap();
        let first = super::lock(dir.path()).unwrap();
        assert!(super::lock(dir.path()).is_err());
        drop(first);
        assert!(super::lock(dir.path()).is_ok());
    }
}
