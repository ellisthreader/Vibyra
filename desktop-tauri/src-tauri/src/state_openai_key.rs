//! The OpenAI key held in the operating-system credential store.
//!
//! Reading it used to happen in `AppState::new`, on the main thread before the
//! first window existed: a Keychain read that needs the user's permission
//! shows a modal prompt, and nothing appeared until it was answered. The read
//! now starts on a thread of its own at startup. The first caller that needs
//! the key waits for it and applies the one-time move of a legacy plaintext
//! key out of settings, exactly as startup used to.

use std::path::Path;
use std::sync::OnceLock;
use std::thread::JoinHandle;

use parking_lot::Mutex;
use vibyra_core::settings::Settings;

use crate::secret_store::SecretStore;

type StoreRead = Result<Option<String>, String>;

pub struct StoredKey {
    read: Mutex<Option<JoinHandle<StoreRead>>>,
    loaded: OnceLock<Loaded>,
}

pub struct Loaded {
    pub key: Mutex<Option<String>>,
    pub store_available: Mutex<bool>,
}

/// What a migration needs of `AppState`: the settings, where they live, and
/// the lock every settings write takes so an older write cannot land last.
pub struct SettingsFile<'a> {
    pub settings: &'a Mutex<Settings>,
    pub path: &'a Path,
    pub write: &'a Mutex<()>,
}

impl StoredKey {
    pub fn start() -> Self {
        let read = std::thread::Builder::new()
            .name("vibyra-credential-read".into())
            .spawn(|| SecretStore.read_openai_key())
            .ok();
        Self {
            read: Mutex::new(read),
            loaded: OnceLock::new(),
        }
    }

    /// Waits for the startup read; the first caller also migrates. Must not be
    /// called while holding the settings lock or the settings write lock.
    pub fn get(&self, file: SettingsFile<'_>) -> &Loaded {
        self.loaded.get_or_init(|| {
            let read = match self.read.lock().take() {
                Some(handle) => handle
                    .join()
                    .unwrap_or_else(|_| Err("the credential store read failed".into())),
                None => SecretStore.read_openai_key(),
            };
            let _write = file.write.lock();
            let mut settings = file.settings.lock();
            let (key, available) = migrate(read, &SecretStore, &mut settings, file.path);
            Loaded {
                key: Mutex::new(key),
                store_available: Mutex::new(available),
            }
        })
    }
}

fn migrate(
    read: StoreRead,
    store: &SecretStore,
    settings: &mut Settings,
    path: &Path,
) -> (Option<String>, bool) {
    match read {
        Ok(Some(key)) => {
            remove_legacy_key(settings, path);
            (Some(key), true)
        }
        Ok(None) => migrate_legacy_key(store, settings, path),
        Err(error) => {
            eprintln!("Vibyra credential migration deferred: {error}");
            (settings.legacy_openai_api_key.clone(), false)
        }
    }
}

fn migrate_legacy_key(
    store: &SecretStore,
    settings: &mut Settings,
    path: &Path,
) -> (Option<String>, bool) {
    let Some(key) = settings.legacy_openai_api_key.clone() else {
        return (None, true);
    };
    match store.write_openai_key(Some(&key)) {
        Ok(()) => {
            remove_legacy_key(settings, path);
            (Some(key), true)
        }
        Err(error) => {
            eprintln!("Vibyra credential migration deferred: {error}");
            (Some(key), false)
        }
    }
}

fn remove_legacy_key(settings: &mut Settings, path: &Path) {
    // Nothing to remove is the ordinary launch; it used to rewrite and fsync
    // the settings file every time regardless.
    if settings.legacy_openai_api_key.take().is_none() {
        return;
    }
    if let Err(error) = settings.save_to(path) {
        eprintln!("Vibyra could not remove a migrated plaintext credential: {error}");
    }
}
