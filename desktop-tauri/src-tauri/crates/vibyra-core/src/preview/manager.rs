use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;

use crate::CoreResult;

use super::launcher::launch;
use super::service::{PreviewRuntime, PreviewService};
use super::types::{PreviewPhase, PreviewStatus};

/// How long dev servers get to exit on their own when the app quits, shared
/// by all of them rather than spent one after another.
const QUIT_GRACE: Duration = Duration::from_millis(400);

/// Each service has its own lock, so a status poll's readiness probe (an
/// 80 ms connect per port) holds up only that preview, never the map.
type Shared = Arc<Mutex<PreviewService>>;

pub struct PreviewManager {
    services: Mutex<HashMap<String, Shared>>,
    operations: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    project_generations: Mutex<HashMap<String, u64>>,
    next_runtime_id: AtomicU64,
    /// Set by [`PreviewManager::stop_all`]: a launch still in flight when the
    /// app quits is stopped instead of registered.
    shut_down: AtomicBool,
}

impl PreviewManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            services: Mutex::new(HashMap::new()),
            operations: Mutex::new(HashMap::new()),
            project_generations: Mutex::new(HashMap::new()),
            next_runtime_id: AtomicU64::new(1),
            shut_down: AtomicBool::new(false),
        })
    }

    pub fn start(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
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
        let mut service = launch(root, target_id)?;
        if self.generation(&identity.root) != generation || self.shut_down.load(Ordering::SeqCst) {
            return Ok(service.stopped_status());
        }
        service.runtime_id = self.next_runtime_id.fetch_add(1, Ordering::SeqCst);
        let status = service.status();
        let service = Arc::new(Mutex::new(service));
        self.services.lock().insert(identity.key, service);
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
            return Ok(service.lock().stopped_status());
        }
        Ok(PreviewStatus {
            phase: PreviewPhase::Stopped,
            ..PreviewStatus::idle(target_id)
        })
    }

    pub fn stop_project(&self, root: &str) -> CoreResult<()> {
        let root = stable_root(root)?.to_string_lossy().into_owned();
        let prefix = format!("{root}\0");
        *self.project_generations.lock().entry(root).or_default() += 1;
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
            service.lock().stop();
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

fn stop_services(services: impl Iterator<Item = Shared>) {
    let services = services.collect::<Vec<_>>();
    let mut guards = services
        .iter()
        .map(|service| service.lock())
        .collect::<Vec<_>>();
    let mut children = Vec::new();
    for service in guards.iter_mut() {
        match &mut service.runtime {
            PreviewRuntime::Static(server) => server.stop(),
            PreviewRuntime::Processes(list) => {
                children.extend(list.iter_mut().map(|managed| &mut managed.child));
            }
        }
    }
    crate::process_group::stop_all(children, QUIT_GRACE);
}

struct ServiceIdentity {
    root: String,
    key: String,
}

impl ServiceIdentity {
    fn new(root: &str, target_id: &str) -> CoreResult<Self> {
        let root = stable_root(root)?.to_string_lossy().into_owned();
        let key = format!("{root}\0{target_id}");
        Ok(Self { root, key })
    }
}

fn stable_root(root: &str) -> CoreResult<PathBuf> {
    let root = Path::new(root);
    let absolute = if root.is_absolute() {
        root.to_owned()
    } else {
        env::current_dir()?.join(root)
    };
    Ok(absolute.components().collect())
}
