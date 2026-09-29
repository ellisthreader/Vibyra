use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Weak};

use parking_lot::Mutex;

use crate::CoreResult;

use super::launcher::launch;
use super::manager_support::{stable_root, stop_services, ServiceIdentity};
use super::refresher::{ensure_running, DesktopProbe, PreviewListener};
use super::service::PreviewService;
use super::types::{DesktopCommand, PreviewPhase, PreviewStatus};

/// Each service has its own lock, so a status poll's readiness probe (an
/// 80 ms connect per port) holds up only that preview, never the map.
pub(super) type Shared = Arc<Mutex<PreviewService>>;

pub struct PreviewManager {
    pub(super) services: Mutex<HashMap<String, Shared>>,
    operations: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    project_generations: Mutex<HashMap<String, u64>>,
    next_runtime_id: AtomicU64,
    /// Set by [`PreviewManager::stop_all`]: a launch still in flight when the
    /// app quits is stopped instead of registered.
    shut_down: AtomicBool,
    pub(super) me: Weak<Self>,
    pub(super) refreshing: AtomicBool,
    pub(super) probe: Mutex<Option<Arc<dyn DesktopProbe>>>,
    pub(super) listener: Mutex<Option<PreviewListener>>,
}

impl PreviewManager {
    pub fn new() -> Arc<Self> {
        Arc::new_cyclic(|me| Self {
            services: Mutex::new(HashMap::new()),
            operations: Mutex::new(HashMap::new()),
            project_generations: Mutex::new(HashMap::new()),
            next_runtime_id: AtomicU64::new(1),
            shut_down: AtomicBool::new(false),
            me: me.clone(),
            refreshing: AtomicBool::new(false),
            probe: Mutex::new(None),
            listener: Mutex::new(None),
        })
    }

    pub fn start(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
        self.start_with(root, target_id, &[])
    }

    /// Starts a target, including desktop commands approved for the project.
    pub fn start_with(
        &self,
        root: &str,
        target_id: &str,
        custom: &[DesktopCommand],
    ) -> CoreResult<PreviewStatus> {
        let identity = ServiceIdentity::new(root, target_id)?;
        let operation = self.operation(&identity.key);
        let _operation_guard = operation.lock();
        let existing = self.services.lock().get(&identity.key).cloned();
        if let Some(existing) = existing {
            let mut service = existing.lock();
            service.refresh();
            if matches!(
                service.phase,
                PreviewPhase::Starting | PreviewPhase::Running
            ) {
                return Ok(service.status());
            }
            // The operation lock is held, so nothing else can have put a new
            // service under this key since it was read.
            self.services.lock().remove(&identity.key);
            service.stop();
        }

        let generation = self.generation(&identity.root);
        let probe = self.probe.lock().clone();
        let mut service = launch(root, target_id, custom, probe)?;
        if self.generation(&identity.root) != generation || self.shut_down.load(Ordering::SeqCst) {
            return Ok(service.stopped_status());
        }
        service.runtime_id = self.next_runtime_id.fetch_add(1, Ordering::SeqCst);
        let status = service.status();
        let desktop = service.is_live_desktop();
        let runtime_id = service.runtime_id;
        let service = Arc::new(Mutex::new(service));
        self.services.lock().insert(identity.key, service);
        if desktop {
            ensure_running(self);
            self.emit(&identity.root, runtime_id, &status);
        }
        Ok(status)
    }

    pub fn status(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
        Ok(self.status_with_runtime(root, target_id)?.0)
    }

    pub fn status_with_runtime(
        &self,
        root: &str,
        target_id: &str,
    ) -> CoreResult<(PreviewStatus, Option<u64>)> {
        let identity = ServiceIdentity::new(root, target_id)?;
        let service = self.services.lock().get(&identity.key).cloned();
        let Some(service) = service else {
            return Ok((PreviewStatus::idle(target_id), None));
        };
        let mut service = service.lock();
        service.refresh();
        Ok((service.status(), Some(service.runtime_id)))
    }

    pub fn stop(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
        let identity = ServiceIdentity::new(root, target_id)?;
        let operation = self.operation(&identity.key);
        let _operation_guard = operation.lock();
        let removed = self.services.lock().remove(&identity.key);
        if let Some(service) = removed {
            let (status, runtime_id) = {
                let mut service = service.lock();
                (service.stopped_status(), service.runtime_id)
            };
            self.emit(&identity.root, runtime_id, &status);
            return Ok(status);
        }
        Ok(PreviewStatus {
            phase: PreviewPhase::Stopped,
            ..PreviewStatus::idle(target_id)
        })
    }

    pub fn stop_project(&self, root: &str) -> CoreResult<()> {
        let root = stable_root(root)?.to_string_lossy().into_owned();
        let prefix = format!("{root}\0");
        *self
            .project_generations
            .lock()
            .entry(root.clone())
            .or_default() += 1;
        let removed = {
            let mut services = self.services.lock();
            let keys = services
                .keys()
                .filter(|key| key.starts_with(&prefix))
                .cloned()
                .collect::<Vec<_>>();
            keys.into_iter()
                .filter_map(|key| services.remove(&key))
                .collect::<Vec<_>>()
        };
        for service in removed {
            let (status, runtime_id) = {
                let mut service = service.lock();
                (service.stopped_status(), service.runtime_id)
            };
            self.emit(&root, runtime_id, &status);
        }
        Ok(())
    }

    /// Stops every preview when the app quits. Tauri ends the process with
    /// `exit`, so `Drop` never runs; dev servers lead their own process group
    /// and would otherwise outlive the app. All of them are signalled first
    /// and then waited for once.
    pub fn stop_all(&self) {
        self.shut_down.store(true, Ordering::SeqCst);
        let services = self.services.lock().drain().collect::<Vec<_>>();
        stop_services(services.into_iter().map(|(_, service)| service));
    }

    fn operation(&self, key: &str) -> Arc<Mutex<()>> {
        Arc::clone(
            self.operations
                .lock()
                .entry(key.to_owned())
                .or_insert_with(|| Arc::new(Mutex::new(()))),
        )
    }

    fn generation(&self, root: &str) -> u64 {
        *self.project_generations.lock().get(root).unwrap_or(&0)
    }
}

impl Drop for PreviewManager {
    fn drop(&mut self) {
        stop_services(self.services.get_mut().drain().map(|(_, service)| service));
    }
}
