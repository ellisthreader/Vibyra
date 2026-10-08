use super::{
    address::{connection_address, default_address},
    backend::DesktopBackend,
    preferences::{computer_name, save},
    shared_backend, PhoneConnection, NO_NETWORK,
};
use std::{net::SocketAddr, sync::Arc};
use vibyra_core::pty::PtyManager;
use vibyra_host::EmbeddedHost;

impl PhoneConnection {
    pub fn enable(&mut self, manager: Arc<PtyManager>) -> Result<(), String> {
        self.enabled = true;
        save(&self.path, true, self.typing(), self.remote_enabled)?;
        if self.host.is_some() {
            return Ok(());
        }
        let started = self.start(manager);
        self.error = started.clone().err();
        started
    }

    pub fn disable(&mut self) -> Result<(), String> {
        // Stop network access even if writing the preference fails.
        self.enabled = false;
        self.notifications = None;
        self.remote = None;
        self.host = None;
        self.address = String::new();
        self.pending_address = None;
        self.error = None;
        save(&self.path, false, self.typing(), self.remote_enabled)
    }

    /// A single route sample is reused for the rebind. Two consecutive samples
    /// must agree before a working listener is replaced; short VPN/link flaps
    /// must not disconnect an already paired phone.
    pub fn refresh(&mut self, manager: Arc<PtyManager>) {
        if !self.enabled {
            return;
        }
        let detected = default_address();
        if let Some(host) = self.host.as_mut() {
            if !rebind_ready(&self.address, &mut self.pending_address, &detected) {
                return;
            }
            let Ok(address) = connection_address(&detected) else {
                return;
            };
            match host.rebind(SocketAddr::from((address, 4319))) {
                Ok(()) => {
                    self.address = detected;
                    self.pending_address = None;
                    self.error = None;
                }
                Err(error) => self.error = Some(error),
            }
            return;
        }
        self.notifications = None;
        self.remote = None;
        self.host = None;
        self.address = String::new();
        self.pending_address = None;
        self.error = self.start_at(manager, &detected).err();
    }

    pub(super) fn start(&mut self, manager: Arc<PtyManager>) -> Result<(), String> {
        self.start_at(manager, &default_address())
    }

    fn start_at(&mut self, manager: Arc<PtyManager>, detected: &str) -> Result<(), String> {
        if detected.is_empty() {
            return Err(NO_NETWORK.into());
        }
        let address = connection_address(detected)?;
        let terminal = DesktopBackend::new_with_preview(
            manager,
            self.workspace.clone(),
            self.typing.clone(),
            self.vault.clone(),
            self.requests.clone(),
            self.preview_service.clone().map(|preview| preview as _),
        )?;
        let terminal = terminal.with_provider_auth(self.provider_auth.clone());
        let backend: Arc<dyn vibyra_host::Backend> = match &self.chats {
            Some(chats) => Arc::new(shared_backend::SharedBackend {
                terminal,
                chats: chats.clone(),
                typing: self.typing.clone(),
            }),
            None => Arc::new(terminal),
        };
        let host = EmbeddedHost::start_managed_with_key_store(
            self.path.clone(),
            SocketAddr::from((address, 4319)),
            backend,
            &computer_name(),
            Some(&crate::secret_store::SecretStore),
            self.remote_enabled,
        )?;
        self.address = address.to_string();
        self.host = Some(host);
        if self.remote_enabled {
            self.start_remote();
        }
        Ok(())
    }
}

fn rebind_ready(active: &str, pending: &mut Option<String>, detected: &str) -> bool {
    if detected.is_empty() || detected == active {
        *pending = None;
        return false;
    }
    if pending.as_deref() == Some(detected) {
        return true;
    }
    *pending = Some(detected.to_owned());
    false
}

#[cfg(test)]
mod tests {
    use super::rebind_ready;

    #[test]
    fn transient_route_changes_do_not_replace_a_working_listener() {
        let mut pending = None;
        assert!(!rebind_ready("192.168.1.4", &mut pending, "10.0.0.4"));
        assert!(!rebind_ready("192.168.1.4", &mut pending, ""));
        assert_eq!(pending, None);
        assert!(!rebind_ready("192.168.1.4", &mut pending, "10.0.0.4"));
        assert!(!rebind_ready("192.168.1.4", &mut pending, "192.168.1.4"));
        assert!(!rebind_ready("192.168.1.4", &mut pending, "10.0.0.4"));
        assert!(rebind_ready("192.168.1.4", &mut pending, "10.0.0.4"));
    }
}
