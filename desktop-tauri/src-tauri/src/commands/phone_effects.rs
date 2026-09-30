//! Native fences for renderer work originating in a live phone RPC.
use crate::{
    phone::{requests::EffectGuard, PhoneConnection},
    state::AppState,
};
use parking_lot::Mutex;
use std::{path::Path, sync::Arc};

#[path = "phone_effect_identity.rs"]
mod identity;

pub(super) struct PhoneEffect {
    grant: EffectGuard,
    phone: Arc<Mutex<PhoneConnection>>,
    project: Option<String>,
    root: Option<std::path::PathBuf>,
    saved: Option<(i64, String, String)>,
    adopt_root: Option<std::path::PathBuf>,
}
impl PhoneEffect {
    pub fn capture(
        state: &AppState,
        id: Option<&str>,
        actions: &[&str],
        project: Option<&str>,
        pane: Option<i64>,
    ) -> Result<Option<Self>, String> {
        Self::capture_queued(state.phone.clone(), id, actions, project, pane)
    }
    pub(super) fn capture_queued(
        connection: Arc<Mutex<PhoneConnection>>,
        id: Option<&str>,
        actions: &[&str],
        project: Option<&str>,
        pane: Option<i64>,
    ) -> Result<Option<Self>, String> {
        let Some(id) = id else {
            return Ok(None);
        };
        let phone = connection.lock();
        let grant = phone
            .requests
            .authorize_effect(id, actions, project, pane)?;
        let project = project.or_else(|| grant.request()["projectId"].as_str());
        let saved = if grant.request()["action"] == "resumeSaved" {
            let pane = grant.request()["paneId"]
                .as_i64()
                .ok_or("Select a saved terminal")?;
            let (kind, title) = phone
                .saved_terminal(pane, project.ok_or("Select a phone project")?)
                .ok_or("This saved terminal changed")?;
            Some((pane, kind, title))
        } else {
            None
        };
        let project = project.map(str::to_owned);
        let root = project
            .as_deref()
            .map(|project| {
                phone
                    .project_root(project)
                    .ok_or("This phone project is no longer open")?
                    .canonicalize()
                    .map_err(|_| "This phone project folder is unavailable")
            })
            .transpose()?;
        let adopt_root = if grant.request()["action"] == "adopt" {
            Some(
                Path::new(
                    grant.request()["path"]
                        .as_str()
                        .ok_or("Select a project folder")?,
                )
                .canonicalize()
                .map_err(|_| "This project folder is unavailable")?,
            )
        } else {
            None
        };
        drop(phone);
        let effect = Self {
            grant,
            phone: connection,
            project,
            root,
            saved,
            adopt_root,
        };
        effect.check()?;
        Ok(Some(effect))
    }
    pub fn check(&self) -> Result<(), String> {
        self.grant.check("terminal:access")?;
        let phone = self.phone.lock();
        if !matches!(
            self.grant.request()["action"].as_str(),
            Some("models" | "accountDefaults")
        ) && !phone.allows_terminal_effect()
        {
            return Err("Typing from your phone is off".into());
        }
        if let (Some(project), Some(root)) = (&self.project, &self.root) {
            let current = phone
                .project_root(project)
                .ok_or("This phone project is no longer open")?;
            if current.canonicalize().ok().as_ref() != Some(root) {
                return Err("This phone project changed".into());
            }
        }
        if let Some((id, kind, title)) = &self.saved {
            if phone.saved_terminal(*id, self.project.as_deref().unwrap_or(""))
                != Some((kind.clone(), title.clone()))
            {
                return Err("This saved terminal changed".into());
            }
        }
        if let Some(root) = &self.adopt_root {
            self.grant.check("files:upload")?;
            if Path::new(self.grant.request()["path"].as_str().unwrap_or(""))
                .canonicalize()
                .ok()
                .as_ref()
                != Some(root)
            {
                return Err("This project folder changed".into());
            }
        }
        Ok(())
    }
    pub fn request(&self) -> &serde_json::Value {
        self.grant.request()
    }
}
pub(super) fn check(effect: &Option<PhoneEffect>) -> Result<(), String> {
    effect.as_ref().map_or(Ok(()), PhoneEffect::check)
}

/// Retains authorization through native locks, workspace writes and process launch.
pub(super) fn scoped<T>(
    effect: Option<PhoneEffect>,
    run: impl FnOnce(&Option<PhoneEffect>) -> T,
) -> T {
    let effect = Arc::new(effect);
    let captured = effect.clone();
    vibyra_core::preview::with_launch_authorization(
        Arc::new(move |_| check(&captured).map_err(vibyra_core::CoreError::Settings)),
        || run(&effect),
    )
}
