use std::net::{IpAddr, SocketAddr};

pub fn allowed(listener: SocketAddr, peer: SocketAddr) -> bool {
    match (listener.ip(), peer.ip()) {
        (IpAddr::V6(local), IpAddr::V6(remote)) => {
            if local.is_loopback() {
                return remote.is_loopback();
            }
            // IPv6 global addresses can be LAN addresses. Never turn enabling
            // desktop viewing into a globally reachable IPv6 server.
            !remote.is_loopback() && local.segments()[..4] == remote.segments()[..4]
        }
        (IpAddr::V4(_), IpAddr::V4(_)) => true,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ipv6_peers_must_share_the_selected_lan_prefix() {
        let local = "[2001:db8:1234:5678::10]:4319".parse().unwrap();
        assert!(allowed(
            local,
            "[2001:db8:1234:5678::20]:50000".parse().unwrap()
        ));
        assert!(!allowed(
            local,
            "[2001:db8:1234:5679::20]:50000".parse().unwrap()
        ));
        assert!(!allowed(
            local,
            "[::ffff:192.168.1.2]:50000".parse().unwrap()
        ));
        assert!(!allowed(local, "192.168.1.2:50000".parse().unwrap()));
    }
}
