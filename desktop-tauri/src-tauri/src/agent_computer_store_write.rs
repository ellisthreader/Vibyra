//! Synced, same-directory replacement; no partially written grant store is visible.
use super::Grant;
use std::io::Write;
use std::path::{Path, PathBuf};

pub(super) fn save(file: &Path, grants: &[Grant]) -> Result<(), String> {
    save_with(file, grants, replace)
}

fn save_with(
    file: &Path,
    grants: &[Grant],
    commit: impl FnOnce(&Path, &Path, &Path) -> Result<(), String>,
) -> Result<(), String> {
    let parent = file.parent().ok_or("No Agent Computer state directory")?;
    std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    // canonicalize supplies extended-length Windows paths and keeps both names
    // on the same resolved parent. No cross-volume copy fallback is permitted.
    #[cfg(windows)]
    let parent = parent.canonicalize().map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    let parent = parent.to_path_buf();
    let file = parent.join(file.file_name().ok_or("No Agent Computer state filename")?);
    let bytes = serde_json::to_vec(grants).map_err(|e| e.to_string())?;
    let mut random = [0u8; 8];
    getrandom::fill(&mut random).map_err(|e| e.to_string())?;
    let hex: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
    let pending = parent.join(format!("agent-computer-{hex}.pending"));
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::OpenOptionsExt;
        use windows::Win32::Storage::FileSystem::FILE_FLAG_WRITE_THROUGH;
        options.custom_flags(FILE_FLAG_WRITE_THROUGH.0);
    }
    let mut output = options.open(&pending).map_err(|e| e.to_string())?;
    // Own cleanup only after create_new succeeds; never delete somebody else's
    // pending file if creation failed or collided.
    let cleanup = Pending(pending);
    let written = output.write_all(&bytes).and_then(|_| output.sync_all());
    // Close before cleanup or replacement, including write/flush errors.
    drop(output);
    written.map_err(|e| e.to_string())?;
    commit(&cleanup.0, &file, &parent)
}

struct Pending(PathBuf);
impl Drop for Pending {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.0);
    }
}

#[cfg(not(windows))]
fn replace(pending: &Path, file: &Path, parent: &Path) -> Result<(), String> {
    std::fs::rename(pending, file).map_err(|e| e.to_string())?;
    std::fs::File::open(parent)
        .and_then(|dir| dir.sync_all())
        .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn replace(pending: &Path, file: &Path, _parent: &Path) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let wide = |path: &Path| -> Result<Vec<u16>, String> {
        let mut value: Vec<_> = path.as_os_str().encode_wide().collect();
        if value.contains(&0) {
            return Err("Agent Computer state path contains a null character".into());
        }
        value.push(0);
        Ok(value)
    };
    let (pending, file) = (wide(pending)?, wide(file)?);
    // Same-parent replacement follows the established Windows atomic-write
    // pattern. Request write-through, propagate every error, never copy/delete
    // or defer to reboot. Directory FlushFileBuffers is not a Windows fsync.
    // SAFETY: both owned UTF-16 paths remain alive and null-terminated for the call.
    unsafe {
        MoveFileExW(
            PCWSTR(pending.as_ptr()),
            PCWSTR(file.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|e| e.to_string())
}

#[cfg(test)]
#[path = "agent_computer_store_write_tests.rs"]
mod tests;
