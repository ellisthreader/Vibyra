//! This Mac's sync identity: a device id (uuid, generated once) and an X25519 pair. The public half and the
//! id live in `<state dir>/cloud-sync/device.json`; the secret in the macOS Keychain (via `security`) or, where
//! there is no keychain, a 0600 file in the state dir. Both sit behind `SecretBackend` so tests use a file.
use crate::crypto::{hex, public_from_secret, unhex};
use crate::error::{Result, SyncError};
use std::path::{Path, PathBuf};

pub trait SecretBackend: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>>;
    fn set(&self, account: &str, value: &str) -> Result<()>;
}

/// 0600 files under `<dir>/secrets/`.
pub struct FileSecrets(pub PathBuf);

impl FileSecrets {
    fn path(&self, account: &str) -> PathBuf {
        let safe: String = account
            .chars()
            .map(|c| {
                if c.is_ascii_alphanumeric() || c == '-' {
                    c
                } else {
                    '_'
                }
            })
            .collect();
        self.0.join("secrets").join(safe)
    }
}

impl SecretBackend for FileSecrets {
    fn get(&self, account: &str) -> Result<Option<String>> {
        match std::fs::read_to_string(self.path(account)) {
            Ok(v) => Ok(Some(v.trim().to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
    fn set(&self, account: &str, value: &str) -> Result<()> {
        crate::fsutil::write_private(&self.path(account), value.as_bytes())
    }
}

/// macOS Keychain through `/usr/bin/security`. NOTE: the secret is briefly visible in this process's argument
/// list to other processes of the same user, which can read the 0600 fallback file anyway.
pub struct MacKeychain;
const SERVICE: &str = "com.vibyra.sync";

impl SecretBackend for MacKeychain {
    fn get(&self, account: &str) -> Result<Option<String>> {
        let out = std::process::Command::new("security")
            .args(["find-generic-password", "-s", SERVICE, "-a", account, "-w"])
            .stdin(std::process::Stdio::null())
            .output()
            .map_err(|e| SyncError::Io(format!("keychain unavailable: {e}")))?;
        if out.status.success() {
            return Ok(Some(
                String::from_utf8_lossy(&out.stdout).trim().to_string(),
            ));
        }
        // 44 = item not found; anything else means the keychain itself is unusable.
        match out.status.code() {
            Some(44) => Ok(None),
            _ => Err(SyncError::Io("keychain read failed".into())),
        }
    }
    fn set(&self, account: &str, value: &str) -> Result<()> {
        let out = std::process::Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                SERVICE,
                "-a",
                account,
                "-w",
                value,
            ])
            .stdin(std::process::Stdio::null())
            .output()
            .map_err(|e| SyncError::Io(format!("keychain unavailable: {e}")))?;
        if out.status.success() {
            Ok(())
        } else {
            Err(SyncError::Io("keychain write failed".into()))
        }
    }
}

/// Keychain first on macOS, the 0600 file when the keychain refuses (or on other systems).
pub struct Preferred {
    primary: Option<Box<dyn SecretBackend>>,
    file: FileSecrets,
}

impl SecretBackend for Preferred {
    fn get(&self, account: &str) -> Result<Option<String>> {
        if let Some(p) = &self.primary {
            if let Ok(Some(v)) = p.get(account) {
                return Ok(Some(v));
            }
        }
        self.file.get(account)
    }
    fn set(&self, account: &str, value: &str) -> Result<()> {
        if let Some(p) = &self.primary {
            if p.set(account, value).is_ok()
                && matches!(p.get(account), Ok(Some(ref v)) if v == value)
            {
                return Ok(());
            }
        }
        self.file.set(account, value)
    }
}

pub fn default_backend(state_dir: &Path) -> Box<dyn SecretBackend> {
    let primary: Option<Box<dyn SecretBackend>> = if cfg!(target_os = "macos") {
        Some(Box::new(MacKeychain))
    } else {
        None
    };
    Box::new(Preferred {
        primary,
        file: FileSecrets(state_dir.join("cloud-sync")),
    })
}

#[derive(Clone)]
pub struct DeviceKeys {
    /// The uuid used as `macId` / `{deviceId}` in the account API.
    pub device_id: String,
    secret: [u8; 32],
    pub public: [u8; 32],
}

impl std::fmt::Debug for DeviceKeys {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "DeviceKeys({}, secret hidden)", self.device_id)
    }
}

impl DeviceKeys {
    pub fn secret(&self) -> &[u8; 32] {
        &self.secret
    }
    pub fn public_hex(&self) -> String {
        hex(&self.public)
    }
    pub fn from_secret(device_id: String, secret: [u8; 32]) -> DeviceKeys {
        DeviceKeys {
            device_id,
            secret,
            public: public_from_secret(&secret),
        }
    }

    /// Loads the identity, creating the device id and key pair on first use. If the id exists but its secret is
    /// gone (keychain reset) a new pair is made and the id kept; the caller must `register_mac` again.
    pub fn load_or_create(state_dir: &Path, backend: &dyn SecretBackend) -> Result<DeviceKeys> {
        let file = crate::paths::sync_root(state_dir).join("device.json");
        let id = std::fs::read_to_string(&file)
            .ok()
            .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
            .and_then(|v| v.get("deviceId")?.as_str().map(str::to_string))
            .filter(|s| uuid::Uuid::parse_str(s).is_ok());
        let device_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
        let account = format!("sync-device-{device_id}");
        let secret = match backend.get(&account)?.and_then(|s| unhex::<32>(&s)) {
            Some(s) => s,
            None => {
                let mut s = [0u8; 32];
                getrandom::fill(&mut s)
                    .map_err(|e| SyncError::Io(format!("no randomness: {e}")))?;
                backend.set(&account, &hex(&s))?;
                s
            }
        };
        let keys = DeviceKeys::from_secret(device_id.clone(), secret);
        let doc = serde_json::json!({ "deviceId": device_id, "publicKey": keys.public_hex() });
        crate::fsutil::write_atomic(&file, doc.to_string().as_bytes())?;
        Ok(keys)
    }
}
