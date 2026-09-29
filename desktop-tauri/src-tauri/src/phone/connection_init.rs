use super::{preview_grants, preview_service, vault, workspace::SharedWorkspace, PhoneConnection};
use crate::account_session::AccountSessionManager;
use parking_lot::Mutex;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{atomic::AtomicBool, Arc},
};
use vibyra_core::pty::PtyManager;

impl PhoneConnection {
    #[cfg(test)]
    pub fn with_chats(
        path: PathBuf,
        manager: Arc<PtyManager>,
        chats: Option<Arc<crate::shared_chats::SharedChats>>,
        account: Option<Arc<AccountSessionManager>>,
    ) -> Mutex<Self> {
        Self::with_chats_preview(path, manager, chats, account, None)
    }
    #[cfg(test)]
    pub fn with_chats_preview(
        path: PathBuf,
        manager: Arc<PtyManager>,
        chats: Option<Arc<crate::shared_chats::SharedChats>>,
        account: Option<Arc<AccountSessionManager>>,
        preview: Option<(
            Arc<vibyra_core::preview::PreviewManager>,
            Arc<preview_grants::PreviewGrants>,
        )>,
    ) -> Mutex<Self> {
        Self::with_chats_preview_accounts(path, manager, chats, account, preview, None)
    }

    pub fn with_chats_preview_accounts(
        path: PathBuf,
        manager: Arc<PtyManager>,
        chats: Option<Arc<crate::shared_chats::SharedChats>>,
        account: Option<Arc<AccountSessionManager>>,
        preview: Option<(
            Arc<vibyra_core::preview::PreviewManager>,
            Arc<preview_grants::PreviewGrants>,
        )>,
        provider_auth: Option<Arc<crate::provider_auth::ProviderAuthManager>>,
    ) -> Mutex<Self> {
        let workspace = SharedWorkspace::default();
        let saved: Value = std::fs::read(path.join("connection.json"))
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or(Value::Null);
        let typing = Arc::new(AtomicBool::new(saved["typing"].as_bool() == Some(true)));
        let preview_service = preview.map(|(preview, grants)| {
            Arc::new(preview_service::PreviewService::new(
                preview,
                grants,
                workspace.clone(),
            ))
        });
        if let Some(preview) = &preview_service {
            preview.set_typing(typing.clone());
        }
        if let (Some(chats), Some(preview)) = (&chats, &preview_service) {
            use super::backend::PreviewControl;
            let (status, run) = (preview.clone(), preview.clone());
            chats.set_default_preview_providers(
                Arc::new(move |device, project| status.agent_status(device, project)),
                Arc::new(move |request| run.agent_run(request)),
            );
        }
        let mut state = Self {
            chats,
            host: None,
            vault: vault::Vault::new(path.join("phone")),
            path,
            enabled: saved["enabled"].as_bool() == Some(true),
            address: String::new(),
            pending_address: None,
            workspace,
            typing,
            remote_enabled: saved["remote"].as_bool() == Some(true),
            remote: None,
            notifications: None,
            account,
            error: None,
            requests: Arc::default(),
            provider_auth,
            preview_service,
        };
        // A saved address from an older build is deliberately ignored: it goes
        // stale the moment this Mac joins another network.
        if state.enabled {
            state.error = state.start(manager).err();
        }
        Mutex::new(state)
    }
}
