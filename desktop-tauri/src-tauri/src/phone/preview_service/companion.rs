//! Route only the companion owned by this exact managed runtime.
use super::{Binding, PreviewService};
impl PreviewService {
    pub(super) fn companion_port(&self, binding: &Binding) -> Option<u16> {
        if binding.attached_port.is_some()
            || binding.automatic.is_some()
            || binding.window.is_some()
        {
            return None;
        }
        self.inner.manager.companion_port(
            binding.root.to_str()?,
            &binding.target_id,
            binding.runtime_id,
        )
    }
    pub(super) fn request_binding(&self, binding: &Binding, path: &str) -> Result<Binding, String> {
        let mut request = binding.clone();
        if path.starts_with("/__vibyra_vite/") {
            if let Some(port) = self.companion_port(binding) {
                request.origin = reqwest::Url::parse(&format!("http://127.0.0.1:{port}/"))
                    .map_err(|e| e.to_string())?;
            }
        }
        Ok(request)
    }
}
