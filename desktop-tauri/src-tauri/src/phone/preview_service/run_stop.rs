use super::PreviewService;
use serde_json::{json, Value};

impl PreviewService {
    /// Phone RPC `preview.stop`: only a run a device of this account started.
    pub fn stop_run(&self, _device: &str, params: &Value) -> Result<Value, String> {
        let project = params["projectId"].as_str().ok_or("Missing project")?;
        let target_id = params["targetId"].as_str().ok_or("Missing app")?;
        let account = self.inner.grants.active_account()?;
        let key = self
            .inner
            .runs
            .lock()
            .iter()
            .find(|((_, target), run)| {
                target == target_id
                    && run.project_id == project
                    && run.account == account
                    && run.ended.is_none()
            })
            .map(|(key, _)| key.clone())
            .ok_or("This app is not running from Vibyra")?;
        let folder = key.0.to_str().ok_or("Invalid project folder")?;
        let status = self
            .inner
            .manager
            .stop(folder, &key.1)
            .map_err(|e| e.to_string())?;
        Ok(json!({"phase":status.phase}))
    }
}
