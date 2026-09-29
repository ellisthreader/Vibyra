use std::net::{IpAddr, Ipv4Addr, SocketAddr};

pub fn allowed(listener: SocketAddr, peer: SocketAddr) -> bool {
    match (listener.ip(), peer.ip()) {
        (IpAddr::V6(local), IpAddr::V6(remote)) => {
            if local.is_loopback() {
                return remote.is_loopback();
            }
            // IPv6 global addresses can be LAN addresses. Never turn enabling
            // desktop viewing into a globally reachable IPv6 server.
            !local.is_unspecified()
                && !local.is_multicast()
                && !remote.is_unspecified()
                && !remote.is_multicast()
                && local.to_ipv4_mapped().is_none()
                && remote.to_ipv4_mapped().is_none()
                && !remote.is_loopback()
                && local.segments()[..4] == remote.segments()[..4]
        }
        (IpAddr::V4(local), IpAddr::V4(remote)) => {
            if local.is_loopback() {
                return remote.is_loopback();
            }
            // A private bind can still receive public source addresses through
            // router forwarding. Only nearby/private VPN peers belong here;
            // internet clients use the outbound Cloud relay.
            private_v4(local) && (private_v4(remote) || remote.is_loopback())
        }
        _ => false,
    }
}

fn private_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    ip.is_private() || ip.is_link_local() || (a == 100 && (64..=127).contains(&b))
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
        assert!(!allowed(
            "[::]:4319".parse().unwrap(),
            "[::2]:50000".parse().unwrap()
        ));
        assert!(!allowed(
            "[ff02::1]:4319".parse().unwrap(),
            "[ff02::2]:50000".parse().unwrap()
        ));
        assert!(!allowed(
            "[::ffff:192.168.1.2]:4319".parse().unwrap(),
            "[::ffff:8.8.8.8]:50000".parse().unwrap()
        ));
    }

    #[test]
    fn forwarded_public_ipv4_never_reaches_the_nearby_listener() {
        let local = "192.168.1.10:4319".parse().unwrap();
        for ip in [
            "10.0.0.2",
            "172.16.0.2",
            "192.168.1.2",
            "100.64.0.2",
            "169.254.1.2",
            "127.0.0.1",
        ] {
            assert!(
                allowed(local, format!("{ip}:50000").parse().unwrap()),
                "{ip}"
            );
        }
        for ip in [
            "8.8.8.8",
            "1.1.1.1",
            "192.0.0.2",
            "0.0.0.0",
            "100.63.255.255",
            "100.128.0.1",
            "224.0.0.1",
            "255.255.255.255",
        ] {
            assert!(
                !allowed(local, format!("{ip}:50000").parse().unwrap()),
                "{ip}"
            );
        }
        assert!(!allowed("8.8.8.8:4319".parse().unwrap(), local));
        assert!(!allowed("0.0.0.0:4319".parse().unwrap(), local));
    }

    #[test]
    fn loopback_listeners_only_accept_loopback_of_the_same_family() {
        assert!(allowed(
            "127.0.0.1:4319".parse().unwrap(),
            "127.0.0.2:50000".parse().unwrap()
        ));
        assert!(!allowed(
            "127.0.0.1:4319".parse().unwrap(),
            "192.168.1.2:50000".parse().unwrap()
        ));
        assert!(allowed(
            "[::1]:4319".parse().unwrap(),
            "[::1]:50000".parse().unwrap()
        ));
        assert!(!allowed(
            "[::1]:4319".parse().unwrap(),
            "[fd00::1]:50000".parse().unwrap()
        ));
    }
}
