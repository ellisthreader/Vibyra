use serde_json::Value;
use vibyra_host::PreviewHandler;

pub(crate) trait PreviewControl: PreviewHandler {
    fn agent_status(&self, _device: &str, _project: &str) -> Result<Value, String> {
        Err("Preview status is unavailable".into())
    }
    fn handoff(&self, device: &str) -> Value {
        self.list_windows(device)
    }
    fn share_window(&self, _device: &str, _candidate: &str) -> Result<Value, String> {
        Err("Update Vibyra on your Mac to share application windows".into())
    }
    fn list(&self, device: &str) -> Value;
    fn list_windows(&self, device: &str) -> Value {
        self.list(device)
    }
    fn close(&self, _device: &str, _generation: u64) {}
    fn start(&self, device: &str, grant_id: &str) -> Result<Value, String>;
    fn open(&self, device: &str, grant_id: &str) -> Result<Value, String>;
    /// Runs a project's desktop app outside any agent sandbox, after the
    /// owner's approval of that exact command.
    fn run(&self, _device: &str, _params: &Value) -> Result<Value, String> {
        Err("Update Vibyra on your computer to run apps from your phone".into())
    }
    fn stop_run(&self, _device: &str, _params: &Value) -> Result<Value, String> {
        Err("Update Vibyra on your computer to run apps from your phone".into())
    }
}
