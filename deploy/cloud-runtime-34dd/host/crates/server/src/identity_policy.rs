//! Restrictive public metadata changes never need the private key unlocked.
use crate::{
    identity::{Identity, LOAD},
    identity_contents::Contents,
    identity_permissions,
};
use std::{fs, path::Path};

pub(crate) fn update(directory: &Path, device: Option<&str>, revoke: bool) -> Result<(), String> {
    let _load = LOAD.lock().map_err(|_| "Host identity is unavailable")?;
    let path = directory.join("identity.json");
    if !path.try_exists().map_err(|e| e.to_string())? {
        return Ok(());
    }
    identity_permissions::directory(directory)?;
    identity_permissions::existing_file(&path)?;
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    let _: Identity = serde_json::from_slice(&bytes).map_err(|_| "Invalid Host identity")?;
    let mut value: serde_json::Value =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid Host identity")?;
    if revoke {
        let devices = value["devices"]
            .as_object_mut()
            .ok_or("Invalid Host devices")?;
        if let Some(device) = device {
            devices.remove(device);
        } else {
            devices.clear();
        }
    } else if value["lan_mode"] == "ask" {
        return Ok(());
    } else {
        value["lan_mode"] = serde_json::json!("ask");
    }
    Contents {
        path,
        bytes: serde_json::to_vec_pretty(&value).map_err(|e| e.to_string())?,
    }
    .write()
}

pub(crate) fn saved_id(directory: &Path) -> Result<Option<String>, String> {
    let _load = LOAD.lock().map_err(|_| "Host identity is unavailable")?;
    let path = directory.join("identity.json");
    if !path.try_exists().map_err(|e| e.to_string())? {
        return Ok(None);
    }
    identity_permissions::directory(directory)?;
    identity_permissions::existing_file(&path)?;
    let identity: Identity = serde_json::from_slice(&fs::read(path).map_err(|e| e.to_string())?)
        .map_err(|_| "Invalid Host identity")?;
    Ok(Some(identity.id()))
}
