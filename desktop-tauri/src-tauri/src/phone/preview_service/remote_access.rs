//! Cloud session permissions travel with each stream, never with a device-wide
//! mutable setting. Nearby sessions retain their explicit local grants.
use super::Stream;
use serde_json::Value;
use std::sync::atomic::Ordering;

impl Stream {
    pub(super) fn permits_remote(&self, permission: &str) -> bool {
        !self.canceled.load(Ordering::SeqCst)
            && self
                .remote_access
                .as_ref()
                .is_none_or(|grant| grant.permits(permission))
    }

    pub(super) fn require_remote(&self, permission: &str) -> Result<(), String> {
        self.permits_remote(permission)
            .then_some(())
            .ok_or_else(|| "This remote session does not permit that action".into())
    }

    pub(super) fn require_window_input(&self, event: &Value) -> Result<(), String> {
        self.require_remote("screen:view")?;
        let permission = match event["kind"].as_str() {
            Some("click" | "scroll") => "mouse:control",
            Some("text" | "key" | "keys") => "keyboard:control",
            _ => return Err("Unsupported window input".into()),
        };
        self.require_remote(permission)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::phone::preview_service::Inbound;
    use parking_lot::{Condvar, Mutex};
    use serde_json::json;
    use std::sync::{atomic::AtomicBool, Arc};
    use vibyra_host::{PreviewAccess, ReceiveWindow, SendWindow, StreamKey};

    struct Grant(Vec<&'static str>, AtomicBool);
    impl PreviewAccess for Grant {
        fn permits(&self, permission: &str) -> bool {
            self.1.load(Ordering::SeqCst) && self.0.contains(&permission)
        }
    }
    fn stream(permissions: Vec<&'static str>) -> (Stream, Arc<Grant>) {
        let grant = Arc::new(Grant(permissions, AtomicBool::new(true)));
        let key = StreamKey::new(1, 1).unwrap();
        (
            Stream {
                remote_access: Some(grant.clone()),
                inbound: Mutex::new(Inbound {
                    window: ReceiveWindow::new(key),
                    chunks: 0,
                    metadata: None,
                    upgraded: false,
                    body: vec![],
                }),
                outbound: Mutex::new(SendWindow::new(key)),
                wake: Condvar::new(),
                canceled: AtomicBool::new(false),
                upgrade: Mutex::new(None),
            },
            grant,
        )
    }
    #[test]
    fn preview_or_terminal_permission_does_not_capture_native_windows() {
        for permissions in [
            vec!["preview:access"],
            vec!["terminal:access"],
            vec!["keyboard:control"],
        ] {
            let (stream, _) = stream(permissions);
            assert!(stream.require_remote("screen:view").is_err());
            assert!(stream.require_window_input(&json!({"kind":"key"})).is_err());
        }
    }
    #[test]
    fn native_input_permissions_are_independent() {
        let (view, _) = stream(vec!["screen:view"]);
        let (mouse, _) = stream(vec!["screen:view", "mouse:control"]);
        let (keyboard, _) = stream(vec!["screen:view", "keyboard:control"]);
        for kind in ["click", "scroll", "text", "key", "keys", "unknown"] {
            let event = json!({"kind":kind});
            assert!(view.require_window_input(&event).is_err());
            assert_eq!(
                mouse.require_window_input(&event).is_ok(),
                matches!(kind, "click" | "scroll")
            );
            assert_eq!(
                keyboard.require_window_input(&event).is_ok(),
                matches!(kind, "text" | "key" | "keys")
            );
        }
    }
    #[test]
    fn queued_input_rechecks_authorization_and_cancellation() {
        let (stream, grant) = stream(vec!["screen:view", "keyboard:control"]);
        let input = json!({"kind":"key"});
        assert!(stream.require_window_input(&input).is_ok());
        grant.1.store(false, Ordering::SeqCst);
        assert!(stream.require_window_input(&input).is_err());
        grant.1.store(true, Ordering::SeqCst);
        stream.canceled.store(true, Ordering::SeqCst);
        assert!(stream.require_window_input(&input).is_err());
    }
}
