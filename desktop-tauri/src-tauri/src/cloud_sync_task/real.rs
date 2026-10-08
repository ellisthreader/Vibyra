//! The real `Port` (the engine, signed in as the current account) and `Env` (app
//! settings and window events). All the glue lives here; the logic is in `worker.rs`.

use std::path::PathBuf;
use std::sync::Arc;

use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use vibyra_sync::{
    AccountState, CloudChange, Engine, LoginOutcome, LoginStatus, ProjectRef, Result, SyncError,
    SyncOptions, SyncOutcome,
};

use super::port::{AutoApply, Config, Env, Event, Port};
use super::slot::EngineSlot;
use super::tracked::Tracked;
use crate::state::AppState;

pub const STATUS_EVENT: &str = "cloud-sync:status";
pub const CHANGES_EVENT: &str = "cloud-sync:changes";

pub struct RealPort {
    pub app: AppHandle,
    pub slot: Arc<EngineSlot>,
    pub tracked: Tracked,
}

pub fn engine_for(app: &AppHandle, slot: &EngineSlot) -> Result<Arc<Engine>> {
    let state = app.state::<AppState>();
    let token = state.account.token().ok_or_else(|| {
        SyncError::Unauthorized("Sign in to keep your projects ready in the cloud.".into())
    })?;
    slot.engine(
        &token,
        &crate::account_api::base_url(),
        crate::account_api::app_version(),
    )
}

/// A project as the engine and the review see it: the folder resolved, so symlinked paths agree everywhere.
pub fn resolved(project: &ProjectRef) -> std::result::Result<ProjectRef, String> {
    let root = std::fs::canonicalize(&project.root)
        .map_err(|_| "The project folder is unavailable.".to_string())?;
    Ok(ProjectRef {
        root,
        ..project.clone()
    })
}

pub fn backup_dir(app: &AppHandle, project: &ProjectRef) -> Option<PathBuf> {
    let state = app.state::<AppState>();
    Some(
        state
            .settings_path
            .parent()?
            .join("cloud-backups")
            .join(format!("sync-{}", vibyra_sync::project_key(&project.id)))
            .join(uuid::Uuid::new_v4().to_string()),
    )
}

impl RealPort {
    fn engine(&self) -> Result<Arc<Engine>> {
        engine_for(&self.app, &self.slot)
    }
}

impl Port for RealPort {
    fn account(&self) -> Result<AccountState> {
        self.engine()?.account_state()
    }
    fn register(&self, mac_name: &str) -> Result<()> {
        self.engine()?.register_mac(mac_name).map(|_| ())
    }
    fn sync(&self, project: &ProjectRef, options: &SyncOptions) -> Result<SyncOutcome> {
        self.engine()?.sync_project(project, options)
    }
    fn poll_down(&self) -> Result<Vec<CloudChange>> {
        let engine = self.engine()?;
        let device = engine.device_id().to_string();
        engine.poll_down(&device)
    }
    fn remove(&self, project: &ProjectRef) -> Result<()> {
        self.engine()?.remove_project(project)
    }
    fn known(&self) -> Vec<ProjectRef> {
        self.tracked.all()
    }
    fn remember(&self, project: &ProjectRef) {
        self.tracked.remember(project);
    }
    fn forget(&self, project: &ProjectRef) {
        self.tracked.forget(project);
    }
    fn auto_apply(&self, project: &ProjectRef) -> Result<AutoApply> {
        let engine = self.engine()?;
        let resolved = resolved(project).map_err(SyncError::Invalid)?;
        let backup =
            backup_dir(&self.app, project).ok_or_else(|| SyncError::Io("no app storage".into()))?;
        match crate::commands::cloud_sync_review::auto_apply(&engine, &resolved, &backup)
            .map_err(SyncError::Invalid)?
        {
            Some(files) => Ok(AutoApply::Applied(files)),
            None => Ok(AutoApply::NeedsReview),
        }
    }
    fn session(&self) -> Option<String> {
        self.app.state::<AppState>().account.token()
    }
    fn codex_login_send(&self, _force: bool) -> Result<LoginOutcome> {
        Err(SyncError::Invalid(
            "Local Codex login copying is no longer supported.".into(),
        ))
    }
    fn codex_login_remove(&self) -> Result<()> {
        self.engine()?.remove_codex_login()
    }
    fn codex_login_status(&self) -> LoginStatus {
        vibyra_sync::logins::LoginStore::new(self.slot.state_dir()).status()
    }
}

pub struct AppEnv {
    pub app: AppHandle,
}

fn mac_name() -> String {
    sysinfo::System::host_name()
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| "This Mac".into())
}

impl Env for AppEnv {
    fn config(&self) -> Config {
        let state = self.app.state::<AppState>();
        let signed_in = state.account.token().is_some();
        let settings = state.settings.lock();
        Config {
            signed_in,
            sync: settings.cloud_sync.clone(),
            projects: settings
                .projects
                .iter()
                .filter(|p| !p.root.is_empty())
                .map(|p| ProjectRef {
                    id: p.id.clone(),
                    name: p.name.clone(),
                    root: PathBuf::from(&p.root),
                })
                .collect(),
            mac_name: mac_name(),
        }
    }

    fn emit(&self, event: Event) {
        match event {
            Event::Status => {
                let _ = self.app.emit(STATUS_EVENT, ());
            }
            Event::Changes(notices) => {
                let payload: Vec<_> = notices
                    .iter()
                    .map(|n| json!({ "projectId": n.project_id, "projectName": n.project_name, "seq": n.seq, "files": n.files }))
                    .collect();
                let _ = self.app.emit(CHANGES_EVENT, payload);
            }
        }
    }
}
