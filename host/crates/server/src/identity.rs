use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
};

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
    pub private_key: String,
    pub public_key: String,
    pub name: String,
    pub devices: BTreeMap<String, Device>,
    #[serde(skip)]
    path: PathBuf,
}

impl Identity {
    pub fn load(directory: &Path, name: Option<&str>) -> Result<Self, String> {
        fs::create_dir_all(directory).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
                .map_err(|e| e.to_string())?;
        }
        let path = directory.join("identity.json");
        if path.exists() {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                if fs::metadata(&path)
                    .map_err(|e| e.to_string())?
                    .permissions()
                    .mode()
                    & 0o077
                    != 0
                {
                    return Err("Host identity permissions must be 0600".into());
                }
            }
            let mut identity: Self =
                serde_json::from_slice(&fs::read(&path).map_err(|e| e.to_string())?)
                    .map_err(|_| "Invalid host identity file")?;
            if hex::decode(&identity.private_key)
                .map_err(|_| "Invalid private key")?
                .len()
                != 32
            {
                return Err("Invalid host private key length".into());
            }
            identity.path = path;
            // Every start passes the machine's name; only a new one is worth
            // a synced write.
            if let Some(name) = name.map(clean_name).filter(|name| *name != identity.name) {
                identity.name = name;
                identity.save()?;
            }
            return Ok(identity);
        }
        let pair = vibyra_transport::generate_keypair()?;
        let identity = Self {
            private_key: hex::encode(&pair[..32]),
            public_key: hex::encode(&pair[32..]),
            name: clean_name(name.unwrap_or("My computer")),
            devices: BTreeMap::new(),
            path,
        };
        identity.save()?;
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
        Ok(Contents {
            path: self.path.clone(),
            bytes: serde_json::to_vec(self).map_err(|e| e.to_string())?,
        })
    }
}

/// One identity file, serialized and ready to be written.
pub struct Contents {
    path: PathBuf,
    bytes: Vec<u8>,
}
impl Contents {
    pub fn write(&self) -> Result<(), String> {
        let directory = self.path.parent().ok_or("Invalid identity path")?;
        let mut file = tempfile::NamedTempFile::new_in(directory).map_err(|e| e.to_string())?;
        file.write_all(&self.bytes).map_err(|e| e.to_string())?;
        file.as_file().sync_all().map_err(|e| e.to_string())?;
        file.persist(&self.path).map_err(|e| e.to_string())?;
        #[cfg(unix)]
        fs::File::open(directory)
            .and_then(|f| f.sync_all())
            .map_err(|e| e.to_string())?;
        Ok(())
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
