use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use parking_lot::Mutex;
use vibyra_core::fsx::WorkspaceWatcher;
use vibyra_core::preview::PreviewManager;
use vibyra_core::pty::{FlushConfig, PtyManager};
use vibyra_core::settings::Settings;

use crate::account_session::AccountSessionManager;
use crate::ai_usage::AiLimits;
use crate::ai_usage_guard::AiUsageGuard;
use crate::commands::voice::VoiceRecording;
use crate::provider_auth::ProviderAuthManager;
use crate::secret_store::SecretStore;
use crate::sink::ChannelSink;
use crate::state_openai_key::{Loaded, SettingsFile, StoredKey};

pub struct AppState {
    pub shared_chats: Arc<crate::shared_chats::SharedChats>,
    pub account: Arc<AccountSessionManager>,
    pub phone: Arc<Mutex<crate::phone::PhoneConnection>>,
    pub manager: Arc<PtyManager>,
    pub sink: Arc<ChannelSink>,
    pub preview: Arc<PreviewManager>,
    /// A damaged grant file stays closed until repaired; terminal access still
    /// starts, and Preview sharing commands report the storage error.
    pub preview_grants: Result<Arc<crate::phone::preview_grants::PreviewGrants>, String>,
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    /// Taken by every settings write, outside `settings`, so the file is
    /// written without blocking readers and two writes never interleave.
    pub settings_write: Mutex<()>,
    pub agent_computer_write: Mutex<()>,
    /// Read off the main thread; see `state_openai_key`.
    openai_api_key: StoredKey,
    /// A key found in the environment or a `.env` file at startup. Read once:
    /// the working directory cannot change under a running window.
    env_openai_key: Option<String>,
    pub usage: Arc<AiUsageGuard>,
    pub provider_auth: Arc<ProviderAuthManager>,
    pub watcher: Mutex<Option<WorkspaceWatcher>>,
    pub voice: Mutex<Option<VoiceRecording>>,
    /// The cancel flag of every scaffold the window has running, by run id.
    /// A build lives on a blocking thread, so cancelling is a flag it reads
    /// between lines rather than a handle anything here can join.
    pub scaffold_runs: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
    /// Set once the user has confirmed the close. Without it the
    /// `CloseRequested` veto would fire again on our own `window.close()` and
    /// the window could never actually shut.
    pub closing: AtomicBool,
    /// Whether a UI able to answer the close veto is mounted. The sign-in
    /// screen is not: vetoing there emitted an event nothing listened for and
    /// the window simply refused to close.
    pub close_guard_armed: AtomicBool,
    /// Set when the UI acknowledges a close request. Until it does, a webview
    /// that has crashed or is still loading looks exactly like one that is
    /// asking the user to confirm — the watchdog uses this to tell them apart.
    pub close_requested_ack: AtomicBool,
}

impl AppState {
    pub fn new() -> Self {
        let sink = Arc::new(ChannelSink::default());
        let manager = PtyManager::new(
            Arc::clone(&sink) as Arc<dyn vibyra_core::pty::OutputSink>,
            FlushConfig::default(),
        );
        let settings_path = Settings::default_path();
        let settings = Settings::load_from(&settings_path);
        let openai_api_key = StoredKey::start();
        let env_openai_key = crate::openai_key::from_environment(settings_path.parent());
        let usage_path = settings_path
            .parent()
            .map(|dir| dir.join("ai-usage.json"))
            .unwrap_or_else(|| std::env::temp_dir().join("vibyra-ai-usage.json"));
        let shared_chats = crate::shared_chats::SharedChats::new(
            settings_path
                .parent()
                .unwrap_or(std::path::Path::new("."))
                .join("shared-chats"),
        );
        let account = Arc::new(AccountSessionManager::default());
        let phone_state_dir = settings_path
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("phone");
        let preview_grants =
            crate::phone::preview_grants::PreviewGrants::load(phone_state_dir.clone())
                .map(Arc::new);
        let preview = PreviewManager::new();
        let phone_preview = preview_grants
            .as_ref()
            .ok()
            .map(|grants| (preview.clone(), grants.clone()));
        let phone = Arc::new(crate::phone::PhoneConnection::with_chats_preview(
            phone_state_dir,
            manager.clone(),
            Some(shared_chats.clone()),
            Some(account.clone()),
            phone_preview,
        ));
        crate::phone::watch(phone.clone(), manager.clone());
        Self {
            shared_chats,
            account,
            phone,
            manager,
            sink,
            preview,
            preview_grants,
            settings: Mutex::new(settings),
            settings_path,
            settings_write: Mutex::new(()),
            agent_computer_write: Mutex::new(()),
            openai_api_key,
            env_openai_key,
            usage: Arc::new(AiUsageGuard::new(usage_path)),
            provider_auth: Arc::new(ProviderAuthManager::default()),
            watcher: Mutex::new(None),
            voice: Mutex::new(None),
            scaffold_runs: Arc::new(Mutex::new(HashMap::new())),
            closing: AtomicBool::new(false),
            close_guard_armed: AtomicBool::new(false),
            close_requested_ack: AtomicBool::new(false),
        }
    }

    /// The stored key, waiting for the startup read if it is still running.
    /// Never call while holding `settings` or `settings_write`.
    fn stored_key(&self) -> &Loaded {
        self.openai_api_key.get(SettingsFile {
            settings: &self.settings,
            path: &self.settings_path,
            write: &self.settings_write,
        })
    }

    pub fn secret_store_available(&self) -> bool {
        *self.stored_key().store_available.lock()
    }

    /// True when chat is running on the environment's key because Settings has
    /// none. "Remove key" cannot take that one away, so the pane says so.
    pub fn openai_key_from_environment(&self) -> bool {
        self.stored_key().key.lock().is_none() && self.env_openai_key.is_some()
    }

    /// A key saved in Settings wins; otherwise the environment supplies one, so
    /// a desktop launched from a checkout that already has `OPENAI_API_KEY`
    /// chats without anyone pasting the key a second time.
    pub fn openai_key(&self) -> Option<String> {
        self.stored_key()
            .key
            .lock()
            .clone()
            .or_else(|| self.env_openai_key.clone())
    }

    /// Writes the key to the operating-system credential store first: if that
    /// fails the key is never taken into memory, so the UI can never claim a
    /// key is saved when nothing was persisted.
    pub fn store_openai_key(&self, key: Option<&str>) -> Result<(), String> {
        // Loaded first, so the startup read cannot land after this write.
        let stored = self.stored_key();
        SecretStore.write_openai_key(key)?;
        *stored.store_available.lock() = true;
        *stored.key.lock() = key
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .map(str::to_owned);
        Ok(())
    }

    pub fn ai_limits(&self) -> AiLimits {
        let settings = self.settings.lock();
        AiLimits {
            daily_calls: settings.ai_daily_call_cap,
            hourly_calls: settings.ai_hourly_call_cap,
            daily_spend_usd: settings.ai_daily_spend_cap_usd,
            monthly_spend_usd: settings.ai_monthly_spend_cap_usd,
        }
    }
}
