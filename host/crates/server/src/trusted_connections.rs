//! A read-only lease on already trusted, confirmed phone sockets. Reconnecting the
//! same device replaces its socket, so a delayed desktop action cannot inherit it.
use crate::EmbeddedHost;
use std::sync::Arc;
use tokio::sync::Notify;

#[derive(Clone)]
pub struct TrustedConnections(Vec<(String, Arc<Notify>)>);

impl EmbeddedHost {
    pub fn trusted_connections(&self) -> Result<TrustedConnections, String> {
        let identity = self
            .shared
            .identity
            .lock()
            .map_err(|_| "Phone identity unavailable")?;
        let active = self
            .shared
            .active
            .lock()
            .map_err(|_| "Phone connections unavailable")?;
        let sockets: Vec<_> = active
            .iter()
            .filter(|(id, _)| identity.devices.contains_key(*id))
            .map(|(id, socket)| (id.clone(), Arc::clone(socket)))
            .collect();
        if sockets.is_empty() {
            return Err("Connect a trusted iPhone to use Vibyra Cloud here.".into());
        }
        Ok(TrustedConnections(sockets))
    }

    /// The stable pairing receipt behind an original admitted socket, never a pending device.
    pub fn admitted_device(&self, lease: &TrustedConnections) -> Option<crate::identity::Device> {
        let identity = self.shared.identity.lock().ok()?;
        let active = self.shared.active.lock().ok()?;
        lease.0.iter().find_map(|(id, socket)| {
            active
                .get(id)
                .filter(|current| Arc::ptr_eq(current, socket))?;
            identity.devices.get(id).cloned()
        })
    }

    pub fn has_trusted_connection(&self, lease: &TrustedConnections) -> bool {
        let Ok(identity) = self.shared.identity.lock() else {
            return false;
        };
        let Ok(active) = self.shared.active.lock() else {
            return false;
        };
        lease.0.iter().any(|(id, socket)| {
            identity.devices.contains_key(id)
                && active
                    .get(id)
                    .is_some_and(|current| Arc::ptr_eq(current, socket))
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::embedded_tests::ViewBackend;

    #[test]
    fn admission_requires_trust_and_a_live_socket_and_reconnect_invalidates_it() {
        let dir = tempfile::tempdir().unwrap();
        let host = EmbeddedHost::start(
            dir.path().to_owned(),
            "127.0.0.1:0".parse().unwrap(),
            Arc::new(ViewBackend::default()),
            "Cloud fixture",
        )
        .unwrap();
        let id = "a".repeat(64);
        assert!(host.trusted_connections().is_err());
        host.shared
            .active
            .lock()
            .unwrap()
            .insert(id.clone(), Arc::new(Notify::new()));
        assert!(
            host.trusted_connections().is_err(),
            "pending/untrusted socket is not enough"
        );
        host.shared.trust(&id, "Phone").unwrap();
        let lease = host.trusted_connections().unwrap();
        assert!(host.has_trusted_connection(&lease));
        host.shared
            .active
            .lock()
            .unwrap()
            .insert(id.clone(), Arc::new(Notify::new()));
        assert!(
            !host.has_trusted_connection(&lease),
            "same device's replacement is a new generation"
        );
        let replacement = host.trusted_connections().unwrap();
        host.shared.identity.lock().unwrap().devices.remove(&id);
        assert!(
            !host.has_trusted_connection(&replacement),
            "revoked trust is refused even before socket exits"
        );
    }

    #[test]
    fn one_remaining_original_trusted_socket_keeps_an_action_valid() {
        let dir = tempfile::tempdir().unwrap();
        let host = EmbeddedHost::start(
            dir.path().to_owned(),
            "127.0.0.1:0".parse().unwrap(),
            Arc::new(ViewBackend::default()),
            "Cloud fixture",
        )
        .unwrap();
        let first = "a".repeat(64);
        let second = "b".repeat(64);
        for id in [&first, &second] {
            host.shared.trust(id, "Phone").unwrap();
            host.shared
                .active
                .lock()
                .unwrap()
                .insert(id.clone(), Arc::new(Notify::new()));
        }
        let lease = host.trusted_connections().unwrap();
        host.shared.active.lock().unwrap().remove(&first);
        assert!(host.has_trusted_connection(&lease));
        host.shared.active.lock().unwrap().clear();
        assert!(!host.has_trusted_connection(&lease));
    }

    #[test]
    fn account_reapproval_ends_presence_before_socket_tasks_can_finish() {
        let dir = tempfile::tempdir().unwrap();
        let host = EmbeddedHost::start(
            dir.path().to_owned(),
            "127.0.0.1:0".parse().unwrap(),
            Arc::new(ViewBackend::default()),
            "Cloud fixture",
        )
        .unwrap();
        let id = "a".repeat(64);
        host.shared.trust(&id, "Phone").unwrap();
        host.shared
            .active
            .lock()
            .unwrap()
            .insert(id.clone(), Arc::new(Notify::new()));
        let previous = host.trusted_connections().unwrap();
        host.request_lan_reapproval().unwrap();
        assert!(!host.has_trusted_connection(&previous));
        assert!(
            host.trusted_connections().is_err(),
            "pending socket shutdown is not live phone authority"
        );
        assert!(
            host.shared.trusted(&id),
            "saved pairing remains available for fresh approval"
        );
        host.shared
            .active
            .lock()
            .unwrap()
            .insert(id, Arc::new(Notify::new()));
        assert!(host.trusted_connections().is_ok());
        assert!(!host.has_trusted_connection(&previous));
    }
}
