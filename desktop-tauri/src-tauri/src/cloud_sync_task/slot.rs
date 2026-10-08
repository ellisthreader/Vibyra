//! The one `Engine` for the signed-in account, shared by the worker and the review
//! commands, rebuilt only when the session token changes. The device key is kept in
//! a 0600 file under the sync state dir: the Keychain backend would put the secret
//! on a `security` command line, so it is deliberately not used here.

use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::Mutex;
use vibyra_sync::{Client, DeviceKeys, Engine, FileSecrets, SyncError};

/// Where sync state lives: the app's own folder, or `VIBYRA_SYNC_STATE_DIR` when set (dev runs).
pub fn state_dir(settings_path: &Path) -> PathBuf {
    if std::env::var_os("VIBYRA_SYNC_STATE_DIR").is_some() {
        return vibyra_sync::default_state_dir();
    }
    settings_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(vibyra_sync::default_state_dir)
}

pub struct EngineSlot {
    state_dir: PathBuf,
    current: Mutex<Option<(String, Arc<Engine>)>>,
    keys: Mutex<Option<DeviceKeys>>,
}

impl EngineSlot {
    pub fn new(state_dir: PathBuf) -> Self {
        EngineSlot {
            state_dir,
            current: Mutex::new(None),
            keys: Mutex::new(None),
        }
    }

    pub fn state_dir(&self) -> &Path {
        &self.state_dir
    }

    fn keys(&self) -> Result<DeviceKeys, SyncError> {
        let mut keys = self.keys.lock();
        if keys.is_none() {
            let backend = FileSecrets(vibyra_sync::paths::sync_root(&self.state_dir));
            *keys = Some(DeviceKeys::load_or_create(&self.state_dir, &backend)?);
        }
        Ok(keys.clone().expect("keys were just set"))
    }

    /// The engine for this session token (a new one when the token changed).
    pub fn engine(
        &self,
        token: &str,
        base_url: &str,
        app_version: Option<&str>,
    ) -> Result<Arc<Engine>, SyncError> {
        let mut current = self.current.lock();
        if let Some((existing, engine)) = current.as_ref() {
            if existing == token {
                return Ok(Arc::clone(engine));
            }
        }
        let mut client = Client::new(base_url, token)?;
        if let Some(version) = app_version {
            client = client.with_app_version(version);
        }
        let engine = Arc::new(Engine::new(self.state_dir.clone(), client, self.keys()?));
        *current = Some((token.to_string(), Arc::clone(&engine)));
        Ok(engine)
    }
}
