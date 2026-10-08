//! Desktop PreviewControl adapter; all behavior remains device scoped.
use super::PreviewService;

impl super::super::backend::PreviewControl for PreviewService {
    fn manual_files(&self, params: &serde_json::Value) -> Result<serde_json::Value, String> {
        PreviewService::manual_files(self, params)
    }
    fn manual_inspect(&self, params: &serde_json::Value) -> Result<serde_json::Value, String> {
        PreviewService::manual_inspect(self, params, true)
    }

    fn agent_status(&self, device: &str, project: &str) -> Result<serde_json::Value, String> {
        self.agent_preview_status(device, project)
    }
    fn list(&self, device: &str) -> serde_json::Value {
        PreviewService::list(self, device)
    }
    fn list_windows(&self, device: &str) -> serde_json::Value {
        self.list_kinds(device, true)
    }
    fn handoff(&self, device: &str) -> serde_json::Value {
        self.list_handoff(device)
    }
    fn share_window(&self, device: &str, candidate: &str) -> Result<serde_json::Value, String> {
        self.remote_control(&["preview:access", "screen:view"], || {
            PreviewService::share_window(self, device, candidate)
        })
    }
    fn close(&self, device: &str, generation: u64) {
        self.inner
            .bindings
            .lock()
            .remove(&(device.into(), generation));
    }
    fn start(&self, device: &str, grant_id: &str) -> Result<serde_json::Value, String> {
        self.remote_control(&["preview:access"], || {
            PreviewService::start(self, device, grant_id)
        })
    }
    fn open(&self, device: &str, grant_id: &str) -> Result<serde_json::Value, String> {
        self.remote_control(&["preview:access"], || {
            PreviewService::open(self, device, grant_id)
        })
    }
    fn run(&self, device: &str, params: &serde_json::Value) -> Result<serde_json::Value, String> {
        self.remote_control(&["preview:access", "terminal:access"], || {
            PreviewService::run(self, device, params)
        })
    }
    fn stop_run(
        &self,
        device: &str,
        params: &serde_json::Value,
    ) -> Result<serde_json::Value, String> {
        self.remote_control(&["preview:access", "terminal:access"], || {
            PreviewService::stop_run(self, device, params)
        })
    }
}
