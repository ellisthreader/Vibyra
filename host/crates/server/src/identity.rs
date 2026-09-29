use super::identity_contents::Contents;
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

pub(crate) static LOAD: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub created_at: String,
    /// When this phone last authenticated, RFC 3339. Absent until it has.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_seen: Option<String>,
    /// Where it came from: an IP address on this network, or the relay.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_from: Option<String>,
    /// `nearby` (direct, same network) or `cloud` (through Vibyra Cloud).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_route: Option<String>,
}

#[derive(Serialize, Deserialize)]
pub struct Identity {
    #[serde(default, skip_serializing)]
    pub private_key: String,
    #[serde(default)]
    pub(crate) key_storage: super::identity_store::KeyStorage,
    #[serde(default)]
    pub(crate) lan_mode: super::lan_authorization::LanMode,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) restrictions: Option<super::remote_restrictions::RestrictionReceipt>,
    pub public_key: String,
    pub name: String,
    pub devices: BTreeMap<String, Device>,
    #[serde(skip)]
    path: PathBuf,
}

impl Identity {
    /// Revoke stopped-Host consent without unlocking or changing its private key.
    pub fn reset_lan_approval(directory: &Path) -> Result<(), String> {
        super::identity_policy::update(directory, None, false)
    }
    pub fn revoke_devices(directory: &Path, device: Option<&str>) -> Result<(), String> {
        super::identity_policy::update(directory, device, true)
    }

    pub fn load(directory: &Path, name: Option<&str>) -> Result<Self, String> {
        Self::load_with_store(directory, name, None)
    }

    pub fn load_with_store(
        directory: &Path,
        name: Option<&str>,
        store: Option<&dyn super::identity_store::IdentityKeyStore>,
    ) -> Result<Self, String> {
        let _load = LOAD.lock().map_err(|_| "Host identity is unavailable")?;
        fs::create_dir_all(directory).map_err(|e| e.to_string())?;
        super::identity_permissions::directory(directory)?;
        let path = directory.join("identity.json");
        let existing = path.try_exists().map_err(|e| e.to_string())?;
        let mut identity = if existing {
            super::identity_permissions::existing_file(&path)?;
            let mut identity: Self =
                serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
                    .map_err(|_| "Invalid host identity file")?;
            identity.path = path;
            identity
        } else {
            let pair = vibyra_transport::generate_keypair()?;
            Self {
                private_key: hex::encode(&pair[..32]),
                public_key: hex::encode(&pair[32..]),
                key_storage: super::identity_store::KeyStorage::File,
                lan_mode: super::lan_authorization::LanMode::Ask,
                restrictions: None,
                name: clean_name(name.unwrap_or("My computer")),
                devices: BTreeMap::new(),
                path,
            }
        };
        let migrated = super::identity_store::restore_or_migrate(&mut identity, store)?;
        let renamed = name.map(clean_name).filter(|name| *name != identity.name);
        let changed = renamed.is_some();
        if let Some(name) = renamed {
            identity.name = name;
        }
        if !existing || migrated || changed {
            identity.save()?;
        }
        Ok(identity)
    }

    pub fn id(&self) -> String {
        self.public_key.clone()
    }

    pub fn save(&self) -> Result<(), String> {
        self.contents()?.write()
    }

    /// What `save` would write, taken while this identity is locked so the
    /// synced write itself can happen after the lock is released.
    pub fn contents(&self) -> Result<Contents, String> {
        let mut value = serde_json::to_value(self).map_err(|e| e.to_string())?;
        if self.key_storage == super::identity_store::KeyStorage::File {
            value["private_key"] = serde_json::Value::String(self.private_key.clone());
        }
        Ok(Contents {
            path: self.path.clone(),
            bytes: serde_json::to_vec(&value).map_err(|e| e.to_string())?,
        })
    }
}

pub fn clean_name(name: &str) -> String {
    let value: String = name.chars().filter(|c| !c.is_control()).take(80).collect();
    if value.trim().is_empty() {
        "Unnamed device".into()
    } else {
        value
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::Identity;
    use std::os::unix::fs::MetadataExt;

    /// Each save replaces the file, so an unchanged inode means no write.
    #[test]
    fn starting_under_the_same_name_does_not_rewrite_the_identity() {
        let dir = tempfile::tempdir().unwrap();
        let file = || {
            std::fs::metadata(dir.path().join("identity.json"))
                .unwrap()
                .ino()
        };
        Identity::load(dir.path(), Some("Studio Mac")).unwrap();
        let written = file();
        Identity::load(dir.path(), Some("Studio Mac")).unwrap();
        assert_eq!(file(), written);
        let renamed = Identity::load(dir.path(), Some("Office Mac")).unwrap();
        assert_ne!(file(), written);
        assert_eq!(renamed.name, "Office Mac");
        assert_eq!(Identity::load(dir.path(), None).unwrap().name, "Office Mac");
    }
}
