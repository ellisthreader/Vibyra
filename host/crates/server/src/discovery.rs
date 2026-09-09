use mdns_sd::{ServiceDaemon, ServiceInfo};
use std::net::SocketAddr;

const SERVICE: &str = "_vibyra-host._tcp.local.";

pub struct Advertisement {
    daemon: ServiceDaemon,
    fullname: String,
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
        Ok(Self { daemon, fullname })
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
    // Publish presence only. Never broadcast invitations, device keys, projects,
    // account identifiers, or credentials. QR/link pairing retains trust.
    let name: String = name
        .chars()
        .scan(0, |bytes, c| {
            *bytes += c.len_utf8();
            (*bytes <= 63).then_some(c)
        })
        .collect();
    let hostname = format!("vibyra-{}.local.", &id[..id.len().min(24)]);
    let properties = [("version", "1")];
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
        assert_eq!(info.get_properties().len(), 1);
        assert_eq!(info.get_property_val_str("version"), Some("1"));
        assert!(!info.is_addr_auto());
        let auto = service_info("Computer", "abcdef", "0.0.0.0:4318".parse().unwrap()).unwrap();
        assert!(auto.is_addr_auto());
    }
}
