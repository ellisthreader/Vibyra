use serde_json::Value;
use std::sync::{mpsc::Receiver, Arc};
use vibyra_transport::preview::Frame as PreviewFrame;

/// Optional, device-scoped website Preview endpoint. Implementations must
/// authorize each stream/generation against a Mac-approved target and cancel
/// their active streams when `disconnected` runs.
pub trait PreviewHandler: Send + Sync + 'static {
    fn receive(&self, device: &str, frame: PreviewFrame) -> Result<(), String>;
    fn subscribe(&self, device: &str) -> Receiver<PreviewFrame>;
    fn disconnected(&self, device: &str);
}

/// Authenticated transport can serve standalone sessions or an embedded desktop.
pub trait Backend: Send + Sync + 'static {
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String>;
    fn subscribe(&self) -> Receiver<Value>;
    /// Called only after Noise and local device trust both succeed. Without an
    /// explicit handler, Preview frames receive a Cancel and terminal RPC stays up.
    fn preview(&self, _device: &str) -> Option<Arc<dyn PreviewHandler>> {
        None
    }
    /// Only what the notification publisher reads, `conversation.updated`.
    /// A backend whose full stream carries much more (a phone's terminal
    /// output, scaffold events it hands out once) narrows it here, so a
    /// publisher with no phone attached does not run all of that.
    // The standalone binary publishes no notifications.
    #[allow(dead_code)]
    fn subscribe_conversations(&self) -> Receiver<Value> {
        self.subscribe()
    }
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
