use super::{AutomaticDevice, Grant};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::Path;

const FILE: &str = "preview-grants.json";

#[derive(Serialize, Deserialize)]
struct Stored {
    version: u8,
    grants: Vec<Grant>,
    #[serde(default)]
    automatic: Vec<AutomaticDevice>,
}

pub(super) fn load(dir: &Path) -> Result<(Vec<Grant>, Vec<AutomaticDevice>), String> {
    let bytes = match fs::read(dir.join(FILE)) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok((Vec::new(), Vec::new()))
        }
        Err(error) => return Err(error.to_string()),
    };
    let stored: Stored = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if stored.version == 2 {
        // Legacy grants were not account-bound, so they cannot be reused.
        return Ok((Vec::new(), Vec::new()));
    }
    if stored.version != 3 && stored.version != 4 {
        return Err("Unsupported Preview grant version".into());
    }
    if stored.grants.len() > super::MAX_GRANTS || stored.automatic.len() > super::MAX_GRANTS {
        return Err("Too many Preview grants".into());
    }
    if stored
        .grants
        .iter()
        .any(|grant| grant.account_id.is_empty())
        || stored
            .automatic
            .iter()
            .any(|device| device.account_id.is_empty() || device.device_id.is_empty())
    {
        return Err("Preview grant has no account identity".into());
    }
    Ok((stored.grants, stored.automatic))
}

pub(super) fn save(
    dir: &Path,
    grants: &[Grant],
    automatic: &[AutomaticDevice],
) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let mut suffix = [0u8; 8];
    getrandom::fill(&mut suffix).map_err(|e| e.to_string())?;
    let suffix = suffix
        .iter()
        .map(|byte| format!("{byte:02x}"))
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
            version: 4,
            grants: grants.to_vec(),
            automatic: automatic.to_vec(),
        })
        .map_err(|e| e.to_string())?;
        file.write_all(&bytes).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, dir.join(FILE)).map_err(|e| e.to_string())?;
        Ok(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(temporary);
    }
    result
}

pub(super) fn clear(dir: &Path) -> Result<(), String> {
    match fs::remove_file(dir.join(FILE)) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
