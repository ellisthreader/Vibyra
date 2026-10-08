use super::*;

impl PreviewManager {
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
}

impl Drop for PreviewManager {
    fn drop(&mut self) {
        stop_services(self.services.get_mut().drain().map(|(_, service)| service));
    }
}
