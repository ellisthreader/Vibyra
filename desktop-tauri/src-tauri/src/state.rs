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
use crate::sink::ChannelSink;

pub struct AppState {
    pub(crate) cloud_management: crate::cloud_management::Grants,
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
        {
            let account = account.clone();
            let manager = manager.clone();
            let chats = Arc::downgrade(&shared_chats);
            shared_chats.set_admission(Arc::new(move || {
                let chats = chats.upgrade().ok_or("This workspace has closed.")?;
                crate::commands::plan_access::admit_resume(&account, &manager, &chats)
            }));
        }
        let phone_state_dir = settings_path
            .parent()
            .unwrap_or(std::path::Path::new("."))
            .join("phone");
        let preview_grants =
            crate::phone::preview_grants::PreviewGrants::load(phone_state_dir.clone())
                .map(Arc::new);
        let preview = PreviewManager::new();
        preview.set_desktop_probe(Arc::new(crate::preview_probe::Probe));
        let phone_preview = preview_grants
            .as_ref()
            .ok()
            .map(|grants| (preview.clone(), grants.clone()));
        let provider_auth = Arc::new(ProviderAuthManager::default());
        let phone = Arc::new(crate::phone::PhoneConnection::with_chats_preview_accounts(
            phone_state_dir,
            manager.clone(),
            Some(shared_chats.clone()),
            Some(account.clone()),
            phone_preview,
            Some(provider_auth.clone()),
        ));
        crate::phone::watch(phone.clone(), manager.clone());
        Self {
            cloud_management: crate::cloud_management::Grants::load(
                settings_path.with_file_name("cloud-management.json"),
            ),
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
            usage: Arc::new(AiUsageGuard::new(usage_path)),
            provider_auth,
            watcher: Mutex::new(None),
            voice: Mutex::new(None),
            scaffold_runs: Arc::new(Mutex::new(HashMap::new())),
            closing: AtomicBool::new(false),
            close_guard_armed: AtomicBool::new(false),
            close_requested_ack: AtomicBool::new(false),
        }
    }

    pub fn ai_limits(&self) -> AiLimits {
        // The server owns the shared token balance. Retired device-local dollar
        // ceilings must not refuse a funded request or carry across accounts.
        AiLimits {
            daily_calls: 0,
            hourly_calls: 0,
            daily_spend_usd: 0.0,
            monthly_spend_usd: 0.0,
        }
    }
}
