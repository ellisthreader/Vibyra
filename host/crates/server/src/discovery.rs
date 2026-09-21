use mdns_sd::{DaemonEvent, Receiver, ServiceDaemon, ServiceInfo};
use std::{
    net::SocketAddr,
    time::{Duration, SystemTime},
};

const SERVICE: &str = "_vibyra-host._tcp.local.";
/// How often a live registration is looked at, and the gap between wall clock
/// and time actually waited that means this machine was asleep rather than busy.
const CHECK: Duration = Duration::from_secs(3);
const SLEPT: Duration = Duration::from_secs(15);

pub struct Advertisement {
    daemon: ServiceDaemon,
    fullname: String,
    events: Option<Receiver<DaemonEvent>>,
}

impl Advertisement {
    pub fn start(name: &str, id: &str, address: SocketAddr) -> Result<Self, String> {
        let service = service_info(name, id, address)?;
        let fullname = service.get_fullname().to_string();
        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        if let Err(error) = daemon.register(service) {
            let _ = daemon.shutdown();
            return Err(error.to_string());
        }
        let events = daemon.monitor().ok();
        Ok(Self {
            daemon,
            fullname,
            events,
        })
    }

    /// Resolves once this registration can no longer be relied on, so it is
    /// made again instead of left to rot.
    ///
    /// A registration is only as good as the sockets it was made on. macOS
    /// drops a multicast membership when the machine sleeps or a link flaps,
    /// and tells nobody: the daemon keeps its sockets, answers no queries, and
    /// a phone looking for this computer finds an empty network while the
    /// computer is plainly on it. Neither thing visible from here proves that
    /// happened, so both are watched — an address arriving or leaving, and the
    /// wall clock running ahead of the time actually waited, which is this
    /// machine having been suspended. Re-registering costs a moment off the
    /// air; staying deaf costs the person their computer.
    pub fn stale(&self) -> impl std::future::Future<Output = ()> + use<> {
        let events = self.events.clone();
        async move {
            loop {
                let before = SystemTime::now();
                tokio::time::sleep(CHECK).await;
                if SystemTime::now()
                    .duration_since(before)
                    .unwrap_or(CHECK)
                    .checked_sub(CHECK)
                    .is_some_and(|drift| drift >= SLEPT)
                {
                    return;
                }
                // The daemon keeps only the last hundred events, so they are
                // taken often enough that an address change cannot be lost
                // behind the chatter of answering queries.
                let Some(events) = events.as_ref() else {
                    continue;
                };
                while let Ok(event) = events.try_recv() {
                    if matches!(
                        event,
                        DaemonEvent::IpAdd(_) | DaemonEvent::IpDel(_) | DaemonEvent::Error(_)
                    ) {
                        return;
                    }
                }
            }
        }
    }
}

impl Drop for Advertisement {
    fn drop(&mut self) {
        if let Ok(done) = self.daemon.unregister(&self.fullname) {
            let _ = done.recv_timeout(std::time::Duration::from_secs(1));
        }
        let _ = self.daemon.shutdown();
    }
}

fn service_info(name: &str, id: &str, address: SocketAddr) -> Result<ServiceInfo, String> {
    if address.ip().is_loopback() {
        return Err("--discover requires a LAN --listen address, such as 0.0.0.0:4318".into());
    }
    // Publish presence, this Host's static public key and its OS family only.
    // The key is public by construction: it lets a nearby phone authenticate
    // the Host it is handshaking with, and authorizes nothing on its own. The
    // OS family (`macos`, `windows`, `linux`) is what the phone draws the found
    // computer as, and says nothing a person in the room could not see. Never
    // broadcast invitations, device keys, projects, account identifiers or
    // credentials; explicit local approval still gates every new device.
    let name: String = name
        .chars()
        .scan(0, |bytes, c| {
            *bytes += c.len_utf8();
            (*bytes <= 63).then_some(c)
        })
        .collect();
    let hostname = format!("vibyra-{}.local.", &id[..id.len().min(24)]);
    let properties = [("version", "1"), ("id", id), ("os", std::env::consts::OS)];
    let ip = if address.ip().is_unspecified() {
        String::new()
    } else {
        address.ip().to_string()
    };
    let service = ServiceInfo::new(
        SERVICE,
        &name,
        &hostname,
        ip.as_str(),
        address.port(),
        &properties[..],
    )
    .map_err(|e| e.to_string())?;
    Ok(if address.ip().is_unspecified() {
        service.enable_addr_auto()
    } else {
        service
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loopback_hosts_are_not_discoverable() {
        assert!(service_info("Computer", "abc", "127.0.0.1:4318".parse().unwrap()).is_err());
        assert!(service_info("Computer", "abc", "[::1]:4318".parse().unwrap()).is_err());
    }

    #[test]
    fn advertisement_only_exposes_presence_and_follows_listen_address() {
        let info =
            service_info("Computer", "abcdef", "192.168.1.10:4318".parse().unwrap()).unwrap();
        assert_eq!(info.get_type(), SERVICE);
        assert_eq!(info.get_port(), 4318);
        assert_eq!(info.get_properties().len(), 3);
        assert_eq!(info.get_property_val_str("version"), Some("1"));
        assert_eq!(info.get_property_val_str("id"), Some("abcdef"));
        assert_eq!(info.get_property_val_str("os"), Some(std::env::consts::OS));
        assert_eq!(info.get_property_val_str("invite"), None);
        assert!(!info.is_addr_auto());
        let auto = service_info("Computer", "abcdef", "0.0.0.0:4318".parse().unwrap()).unwrap();
        assert!(auto.is_addr_auto());
    }
}
