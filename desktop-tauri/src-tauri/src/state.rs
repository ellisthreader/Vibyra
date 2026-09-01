use std::path::PathBuf;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use parking_lot::Mutex;
use vibyra_core::fsx::WorkspaceWatcher;
use vibyra_core::preview::PreviewManager;
use vibyra_core::pty::{flush_config, PtyManager};
use vibyra_core::settings::Settings;

use crate::account_session::AccountSessionManager;
use crate::agent_mode::AgentHub;
use crate::ai_usage::AiLimits;
use crate::ai_usage_guard::AiUsageGuard;
use crate::commands::voice::VoiceRecording;
use crate::github_integration::GithubIntegrationManager;
use crate::provider_auth::ProviderAuthManager;
use crate::secret_store::SecretStore;
use crate::sink::ChannelSink;

pub struct AppState {
    pub account: AccountSessionManager,
    /// Agent Mode's per-account world. Opened on first use, closed on
    /// sign-out; see `agent_mode::hub`.
    pub agents: Arc<AgentHub>,
    pub manager: Arc<PtyManager>,
    pub sink: Arc<ChannelSink>,
    pub preview: Arc<PreviewManager>,
    pub settings: Mutex<Settings>,
    pub settings_path: PathBuf,
    pub openai_api_key: Mutex<Option<String>>,
    pub usage: Arc<AiUsageGuard>,
    pub github_integration: Arc<GithubIntegrationManager>,
    pub provider_auth: Arc<ProviderAuthManager>,
    pub secret_store_available: Mutex<bool>,
    pub watcher: Mutex<Option<WorkspaceWatcher>>,
    pub voice: Mutex<Option<VoiceRecording>>,
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
        // Shared-memory compositing pays for every repaint on the CPU, so the
        // paced tier is slowed to keep a grid of streaming agents off the one
        // WebKit thread that also dispatches input.
        let manager = PtyManager::new(
            Arc::clone(&sink) as Arc<dyn vibyra_core::pty::OutputSink>,
            flush_config(crate::compositing::software_compositing()),
        );
        let settings_path = Settings::default_path();
        let mut settings = Settings::load_from(&settings_path);
        let secret_store = SecretStore;
        let (openai_api_key, secret_store_available) =
            load_and_migrate_key(&secret_store, &mut settings, &settings_path);
        let usage_path = settings_path
            .parent()
            .map(|dir| dir.join("ai-usage.json"))
            .unwrap_or_else(|| std::env::temp_dir().join("vibyra-ai-usage.json"));
        Self {
            account: AccountSessionManager::default(),
            agents: Arc::new(AgentHub::default()),
            manager,
            sink,
            preview: PreviewManager::new(),
            settings: Mutex::new(settings),
            settings_path,
            openai_api_key: Mutex::new(openai_api_key),
            usage: Arc::new(AiUsageGuard::new(usage_path)),
            github_integration: Arc::new(GithubIntegrationManager::default()),
            provider_auth: Arc::new(ProviderAuthManager::default()),
            secret_store_available: Mutex::new(secret_store_available),
            watcher: Mutex::new(None),
            voice: Mutex::new(None),
            closing: AtomicBool::new(false),
            close_guard_armed: AtomicBool::new(false),
            close_requested_ack: AtomicBool::new(false),
        }
    }

    pub fn openai_key(&self) -> Option<String> {
        self.openai_api_key.lock().clone()
    }

    /// Writes the key to the operating-system credential store first: if that
    /// fails the key is never taken into memory, so the UI can never claim a
    /// key is saved when nothing was persisted.
    pub fn store_openai_key(&self, key: Option<&str>) -> Result<(), String> {
        SecretStore.write_openai_key(key)?;
        *self.secret_store_available.lock() = true;
        *self.openai_api_key.lock() = key
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

fn load_and_migrate_key(
    store: &SecretStore,
    settings: &mut Settings,
    path: &std::path::Path,
) -> (Option<String>, bool) {
    match store.read_openai_key() {
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
    path: &std::path::Path,
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

fn remove_legacy_key(settings: &mut Settings, path: &std::path::Path) {
    settings.legacy_openai_api_key = None;
    if let Err(error) = settings.save_to(path) {
        eprintln!("Vibyra could not remove a migrated plaintext credential: {error}");
    }
}
