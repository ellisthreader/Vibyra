use crate::Engine;
use serde_json::Value;

pub(crate) type Reader<'a> = dyn Fn(&str, &Value) -> Result<Value, String> + 'a;

impl Engine {
    /// A read-only adapter uses the same account/chat/device binding, expiry,
    /// explicit decision and durable replay receipt as project files. Its callback
    /// runs only after those gates, and can never replace a write operation.
    pub fn external_read(
        &self,
        device: &str,
        method: &str,
        params: &Value,
        read: impl Fn(&str, &Value) -> Result<Value, String>,
    ) -> Result<Value, String> {
        if !matches!(method, "vibes.bind" | "vibes.tool") || !self.project(params)?.read_only {
            return Err("External reads require a read-only integration binding.".into());
        }
        self.vibes_tool_with(device, method, params, Some(&read))
    }
}
