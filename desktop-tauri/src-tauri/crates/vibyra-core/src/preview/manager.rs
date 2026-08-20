use std::collections::HashMap;
use std::env;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use parking_lot::Mutex;

use crate::CoreResult;

use super::launcher::launch;
use super::service::PreviewService;
use super::types::{PreviewPhase, PreviewStatus};

pub struct PreviewManager {
    services: Mutex<HashMap<String, PreviewService>>,
    operations: Mutex<HashMap<String, Arc<Mutex<()>>>>,
    project_generations: Mutex<HashMap<String, u64>>,
}

impl PreviewManager {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            services: Mutex::new(HashMap::new()),
            operations: Mutex::new(HashMap::new()),
            project_generations: Mutex::new(HashMap::new()),
        })
    }

    pub fn start(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
        let identity = ServiceIdentity::new(root, target_id)?;
        let operation = self.operation(&identity.key);
        let _operation_guard = operation.lock();
        let old = {
            let mut services = self.services.lock();
            if let Some(service) = services.get_mut(&identity.key) {
                service.refresh();
                if matches!(
                    service.phase,
                    PreviewPhase::Starting | PreviewPhase::Running
                ) {
                    return Ok(service.status());
                }
            }
            services.remove(&identity.key)
        };
        if let Some(mut old) = old {
            old.stop();
        }

        let generation = self.generation(&identity.root);
        let mut service = launch(root, target_id)?;
        if self.generation(&identity.root) != generation {
            return Ok(service.stopped_status());
        }
        let status = service.status();
        self.services.lock().insert(identity.key, service);
        Ok(status)
    }

    pub fn status(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
        let identity = ServiceIdentity::new(root, target_id)?;
        let mut services = self.services.lock();
        let Some(service) = services.get_mut(&identity.key) else {
            return Ok(PreviewStatus::idle(target_id));
        };
        service.refresh();
        Ok(service.status())
    }

    pub fn stop(&self, root: &str, target_id: &str) -> CoreResult<PreviewStatus> {
        let identity = ServiceIdentity::new(root, target_id)?;
        let operation = self.operation(&identity.key);
        let _operation_guard = operation.lock();
        if let Some(mut service) = self.services.lock().remove(&identity.key) {
            return Ok(service.stopped_status());
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
        for mut service in removed {
            service.stop();
        }
        Ok(())
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
        for mut service in self.services.get_mut().drain().map(|(_, service)| service) {
            service.stop();
        }
    }
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
