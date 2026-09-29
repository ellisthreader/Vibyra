use super::runs::RunApproval;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

const FILE: &str = "preview-runs.json";
pub(super) const MAX_RUNS: usize = 64;

#[derive(Serialize, Deserialize)]
struct Stored {
    version: u8,
    runs: Vec<RunApproval>,
}

/// A missing file is no approvals; a corrupt one fails closed.
pub(super) fn load(dir: &Path) -> Result<Vec<RunApproval>, String> {
    let bytes = match fs::read(dir.join(FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error.to_string()),
    };
    let stored: Stored = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if stored.version != 1 {
        return Err("Unsupported Preview run approval version".into());
    }
    if stored.runs.len() > MAX_RUNS || stored.runs.iter().any(|run| run.account_id.is_empty()) {
        return Err("Preview run approvals are invalid".into());
    }
    Ok(stored.runs)
}

pub(super) fn save(dir: &Path, runs: &[RunApproval]) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut suffix = [0u8; 8];
    getrandom::fill(&mut suffix).map_err(|e| e.to_string())?;
    let suffix = suffix
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    let temporary = dir.join(format!("{FILE}.{suffix}.pending"));
    let result = (|| {
        let mut options = OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary).map_err(|e| e.to_string())?;
        let bytes = serde_json::to_vec(&Stored {
            version: 1,
            runs: runs.to_vec(),
        })
        .map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, dir.join(FILE)).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}
