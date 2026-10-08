//! Origins and local-address classification for the Agent browser policy.

use std::net::{IpAddr, Ipv4Addr};

/// `scheme://host[:port]` with ws→http, wss→https and default ports dropped.
pub fn origin_of(raw: &str) -> Option<String> {
    let url = url::Url::parse(raw).ok()?;
    if !url.username().is_empty() || url.password().is_some() {
        return None;
    }
    let scheme = match url.scheme() {
        "http" | "ws" => "http",
        "https" | "wss" => "https",
        _ => return None,
    };
    let host = url.host_str()?.trim_end_matches('.').to_ascii_lowercase();
    let port = url.port_or_known_default()?;
    let default = if scheme == "https" { 443 } else { 80 };
    Some(match port == default {
        true => format!("{scheme}://{host}"),
        false => format!("{scheme}://{host}:{port}"),
    })
}

/// Loopback, private, link-local (incl. 169.254.169.254 metadata), CGNAT,
/// unspecified, multicast, benchmarking, reserved, and v6 equivalents: ULA,
/// site-local, IPv4-compatible/mapped/translated forms, 6to4, Teredo and the
/// other IETF/documentation blocks. NAT64 (`64:ff9b::/96`) is judged by the
/// IPv4 address it carries, so public IPv4-only sites stay reachable on a
/// DNS64 network while a carried loopback or metadata address is refused.
pub fn local_address(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => local_v4(v4),
        IpAddr::V6(v6) => local_v6(v6),
    }
}

fn local_v4(v4: Ipv4Addr) -> bool {
    let [a, b, ..] = v4.octets();
    v4.is_loopback()
        || v4.is_private()
        || v4.is_link_local()
        || v4.is_unspecified()
        || v4.is_broadcast()
        || v4.is_multicast()
        || v4.is_documentation()
        || a == 0
        || a >= 240
        || (a == 100 && (64..128).contains(&b))
        || (a == 198 && (b == 18 || b == 19))
        || (a == 192 && b == 0)
}

fn local_v6(v6: std::net::Ipv6Addr) -> bool {
    let s = v6.segments();
    let carried =
        |hi: u16, lo: u16| Ipv4Addr::new((hi >> 8) as u8, hi as u8, (lo >> 8) as u8, lo as u8);
    if let Some(v4) = v6.to_ipv4_mapped() {
        return local_v4(v4);
    }
    if s[..4] == [0; 4] && s[4] == 0xffff && s[5] == 0 {
        return local_v4(carried(s[6], s[7])); // IPv4-translated (SIIT)
    }
    if s[0] == 0x64 && s[1] == 0xff9b && s[2..6] == [0; 4] {
        return local_v4(carried(s[6], s[7])); // NAT64 well-known prefix
    }
    let first = s[0];
    v6.is_loopback()
        || v6.is_unspecified()
        || v6.is_multicast()
        || s[..6] == [0; 6] // ::/96 IPv4-compatible (deprecated), :: and ::1
        || (first & 0xfe00) == 0xfc00 // unique local
        || (first & 0xffc0) == 0xfe80 // link-local
        || (first & 0xffc0) == 0xfec0 // site-local (deprecated)
        || (first == 0x64 && s[1] == 0xff9b) // local-use NAT64 (64:ff9b:1::/48)
        || first == 0x2002 // 6to4
        || (first == 0x2001 && s[1] < 0x0200) // 2001::/23: Teredo, benchmarking, ORCHID, protocol blocks
        || (first == 0x2001 && s[1] == 0x0db8) // documentation
        || (first == 0x3fff && s[1] < 0x1000) // documentation, 3fff::/20
        || (first == 0x0100 && s[1..4] == [0; 3]) // discard-only 100::/64
        || first == 0x5f00 // SRv6 segment identifiers
}

#[cfg(test)]
#[path = "agent_v2_browser_address_tests.rs"]
mod tests;
