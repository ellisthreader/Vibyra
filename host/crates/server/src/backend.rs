use serde_json::Value;
use std::sync::mpsc::Receiver;

/// Authenticated transport can serve standalone sessions or an embedded desktop.
pub trait Backend: Send + Sync + 'static {
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String>;
    fn subscribe(&self) -> Receiver<Value>;
    fn disconnected(&self, device: &str);
    fn pairing_notice(&self) -> &'static str;
}

#[cfg(feature = "standalone")]
impl Backend for vibyra_engine::Engine {
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        self.handle(device, method, params)
    }
    fn subscribe(&self) -> Receiver<Value> {
        self.subscribe()
    }
    fn disconnected(&self, device: &str) {
        self.disconnected(device);
    }
    fn pairing_notice(&self) -> &'static str {
        "Trust allows this phone to start and control shells as your computer user, beyond project folders."
    }
}
