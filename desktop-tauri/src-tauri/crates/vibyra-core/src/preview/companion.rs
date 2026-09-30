//! Exact managed runtime endpoints, never arbitrary discovered ports.
use super::{
    manager::PreviewManager, manager_support::ServiceIdentity, service::PreviewRuntime,
    PreviewPhase,
};
impl PreviewManager {
    pub fn companion_port(&self, root: &str, target: &str, runtime: u64) -> Option<u16> {
        let identity = ServiceIdentity::new(root, target).ok()?;
        let service = self.services.lock().get(&identity.key).cloned()?;
        let mut service = service.lock();
        service.refresh();
        if service.runtime_id != runtime || service.phase != PreviewPhase::Running {
            return None;
        }
        let PreviewRuntime::Processes(children) = &service.runtime else {
            return None;
        };
        children
            .iter()
            .find(|child| child.label == "Vite")
            .map(|child| child.port)
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::preview::{
        process::{new_logs, ManagedChild, TreeGuard},
        service::PreviewService,
    };
    use std::os::unix::process::CommandExt;
    use std::{process::Command, sync::Arc, time::Instant};
    #[test]
    fn companion_requires_the_exact_live_managed_runtime() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        let manager = PreviewManager::new();
        let child = Command::new("sleep")
            .arg("30")
            .process_group(0)
            .spawn()
            .unwrap();
        let child = ManagedChild {
            label: "Vite".into(),
            port: 12345,
            tree: TreeGuard::adopt(&child),
            child,
        };
        let service = PreviewService {
            runtime_id: 7,
            target_id: "site".into(),
            phase: PreviewPhase::Running,
            url: "http://127.0.0.1:12344/".into(),
            command: "test".into(),
            error: None,
            logs: new_logs(),
            started: Instant::now(),
            runtime: PreviewRuntime::Processes(vec![child]),
        };
        let key = ServiceIdentity::new(root, "site").unwrap().key;
        manager
            .services
            .lock()
            .insert(key, Arc::new(parking_lot::Mutex::new(service)));
        assert_eq!(manager.companion_port(root, "site", 7), Some(12345));
        assert_eq!(manager.companion_port(root, "site", 8), None);
        assert_eq!(manager.companion_port(root, "other", 7), None);
        manager.stop(root, "site").unwrap();
        assert_eq!(manager.companion_port(root, "site", 7), None);
    }
}
