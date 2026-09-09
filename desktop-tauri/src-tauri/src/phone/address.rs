use std::net::{IpAddr, SocketAddr, UdpSocket};

pub fn connection_address(value: &str) -> Result<IpAddr, String> {
    let value = value.trim().trim_start_matches('[').trim_end_matches(']');
    let ip: IpAddr = value
        .parse()
        .map_err(|_| "Enter this Mac's IPv4 or IPv6 address")?;
    let allowed = match ip {
        IpAddr::V4(v4) => {
            let b = v4.octets();
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || (b[0] == 100 && (64..=127).contains(&b[1]))
        }
        // IPv6 LANs commonly use global addresses. The embedded listener only
        // accepts peers in the same /64 before WebSocket/Noise authentication.
        IpAddr::V6(v6) => {
            v6.is_loopback() || v6.is_unique_local() || (v6.segments()[0] & 0xe000 == 0x2000)
        }
    };
    if allowed {
        Ok(ip)
    } else {
        Err("Use a Wi-Fi or private VPN address. Translated IPv4 and scoped link-local addresses cannot be used for pairing.".into())
    }
}

pub fn pairing_url(address: &str) -> Result<String, String> {
    Ok(format!(
        "ws://{}",
        SocketAddr::new(connection_address(address)?, 4319)
    ))
}

pub fn default_address() -> String {
    // UDP connect selects a source address without sending a packet. Try both
    // families: IPv6-only Macs can report 192.0.0.2 for the IPv4 CLAT shim.
    for (bind, target) in [
        ("0.0.0.0:0", "192.0.2.1:9"),
        ("[::]:0", "[2001:4860:4860::8888]:9"),
    ] {
        let selected = UdpSocket::bind(bind)
            .and_then(|s| {
                s.connect(target)?;
                s.local_addr()
            })
            .ok()
            .map(|a| a.ip().to_string());
        if let Some(address) = selected.filter(|a| connection_address(a).is_ok()) {
            return address;
        }
    }
    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn ipv6_lan_and_vpn_addresses_use_bracketed_urls() {
        assert_eq!(
            pairing_url("2001:db8:1::42").unwrap(),
            "ws://[2001:db8:1::42]:4319"
        );
        assert_eq!(
            pairing_url("[fd12:3456::42]").unwrap(),
            "ws://[fd12:3456::42]:4319"
        );
        assert_eq!(pairing_url("192.168.1.2").unwrap(), "ws://192.168.1.2:4319");
        for ip in [
            "192.0.0.2",
            "0.0.0.0",
            "::",
            "ff02::1",
            "fe80::1%en0",
            "fe80::1",
            "::ffff:192.168.1.2",
        ] {
            assert!(connection_address(ip).is_err(), "{ip}");
        }
    }
}
