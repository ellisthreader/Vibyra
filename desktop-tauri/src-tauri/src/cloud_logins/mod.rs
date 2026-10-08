//! Explicit, account-bound sign-ins created solely for Cloud. No local credential
//! is read, and startup/status polling never opens a provider browser.
mod create;
mod run;
mod start;
#[cfg(test)]
mod tests;
mod token;
use crate::commands::cloud_management_guard::ManagementSession;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{AppHandle, Emitter, Manager};

pub const STATUS_EVENT: &str = "cloud-logins:status";
const PROVIDERS: [&str; 2] = ["claude", "codex"];

#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProviderView {
    pub id: &'static str,
    pub state: &'static str,
    pub error: Option<String>,
}
struct Job {
    generation: u64,
    cancel: Arc<AtomicBool>,
}
#[derive(Default)]
struct Inner {
    owner: Option<String>,
    epoch: u64,
    generation: u64,
    views: Vec<ProviderView>,
    job: Option<Job>,
}
pub struct CloudLogins {
    inner: Mutex<Inner>,
}

fn fresh_views() -> Vec<ProviderView> {
    PROVIDERS
        .iter()
        .map(|id| ProviderView {
            id,
            state: if create::program(id).is_some() {
                "ready"
            } else {
                "notInstalled"
            },
            error: None,
        })
        .collect()
}
impl Inner {
    fn scope(&mut self, owner: &str, epoch: u64) {
        if self.owner.as_deref() == Some(owner) && self.epoch == epoch {
            return;
        }
        if let Some(job) = self.job.take() {
            job.cancel.store(true, Ordering::SeqCst);
        }
        self.owner = Some(owner.to_owned());
        self.epoch = epoch;
        self.generation = self.generation.wrapping_add(1);
        self.views = fresh_views();
    }
    fn current(&self, owner: &str, epoch: u64, generation: u64) -> bool {
        self.owner.as_deref() == Some(owner) && self.epoch == epoch && self.generation == generation
    }
    fn cancel_generation(&mut self, generation: u64) {
        if self.generation != generation {
            return;
        }
        if let Some(job) = self.job.take() {
            job.cancel.store(true, Ordering::SeqCst);
        }
        self.generation = self.generation.wrapping_add(1);
        self.views = fresh_views();
    }
}
impl CloudLogins {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        self.inner.lock().unwrap_or_else(|e| e.into_inner())
    }
    pub fn views(&self, owner: &str, epoch: u64) -> Vec<ProviderView> {
        let mut inner = self.lock();
        inner.scope(owner, epoch);
        inner.views.clone()
    }
    pub fn stop(&self, owner: &str, epoch: u64) -> Vec<ProviderView> {
        let mut inner = self.lock();
        inner.scope(owner, epoch);
        let generation = inner.generation;
        inner.cancel_generation(generation);
        inner.views.clone()
    }
    fn set(
        &self,
        app: &AppHandle,
        session: &ManagementSession,
        generation: u64,
        id: &'static str,
        state: &'static str,
        error: Option<String>,
    ) {
        let mut inner = self.lock();
        if !inner.current(&session.token, session.epoch, generation) {
            return;
        }
        if let Some(view) = inner.views.iter_mut().find(|v| v.id == id) {
            view.state = state;
            view.error = error;
        }
        drop(inner);
        // The renderer refetches through the current account/presence guard.
        let _ = app.emit(STATUS_EVENT, ());
    }
}
pub fn spawn(app: AppHandle) {
    app.manage(Arc::new(CloudLogins {
        inner: Mutex::new(Inner::default()),
    }));
}
