use super::{local_address, origin_of};

fn refused(address: &str) -> bool {
    local_address(address.parse().unwrap())
}

#[test]
fn ipv6_transition_documentation_and_compatible_ranges_are_local() {
    for address in [
        "2002:7f00:1::1",    // 6to4 carrying 127.0.0.1
        "2002:0808:0808::1", // 6to4 is refused whole: the relay is not the granted site
        "2001::1",           // Teredo 2001::/32
        "2001:0:4136:e378:8000:63bf:3fff:fdd2",
        "2001:2::1",        // benchmarking
        "2001:10::1",       // ORCHID
        "2001:db8::1",      // documentation
        "3fff::1",          // documentation (RFC 9637)
        "::7f00:1",         // IPv4-compatible 127.0.0.1
        "::808:808",        // IPv4-compatible, deprecated even when public
        "::ffff:127.0.0.1", // IPv4-mapped
        "::ffff:10.0.0.1",
        "::ffff:169.254.169.254",
        "::ffff:0:7f00:1",    // IPv4-translated (SIIT)
        "64:ff9b::7f00:1",    // NAT64 carrying loopback
        "64:ff9b::a00:1",     // NAT64 carrying 10.0.0.1
        "64:ff9b::a9fe:a9fe", // NAT64 carrying the metadata address
        "64:ff9b:1::1",       // local-use NAT64
        "fec0::1",            // deprecated site-local
        "fe80::1",
        "fc00::1",
        "fd12:3456::1",
        "ff02::1", // multicast
        "ff0e::1",
        "100::1", // discard-only
        "::",
        "::1",
    ] {
        assert!(refused(address), "{address} must be refused");
    }
}

#[test]
fn public_addresses_stay_reachable_including_public_ipv4_behind_nat64() {
    for address in [
        "2606:4700::1111",
        "2a00:1450:4009::200e",
        "2001:4860:4860::8888",
        "2620:0:ccc::2",
        "64:ff9b::808:808", // NAT64 carrying 8.8.8.8: the only way an IPv4-only site is reachable on a DNS64 network
        "::ffff:8.8.8.8",
        "8.8.8.8",
        "1.1.1.1",
    ] {
        assert!(!refused(address), "{address} must stay reachable");
    }
}

#[test]
fn ipv4_local_classes_are_refused() {
    for address in [
        "127.0.0.1",
        "10.1.2.3",
        "172.16.0.1",
        "192.168.1.1",
        "169.254.169.254",
        "100.64.0.1",
        "0.0.0.0",
        "192.0.0.1",
        "198.18.0.1",
        "224.0.0.1",
        "255.255.255.255",
        "240.0.0.1",
        "203.0.113.9",
    ] {
        assert!(refused(address), "{address} must be refused");
    }
}

#[test]
fn origins_normalise_schemes_ports_and_reject_credentials() {
    assert_eq!(
        origin_of("wss://Example.com:443/x").as_deref(),
        Some("https://example.com")
    );
    assert_eq!(
        origin_of("ws://example.com:8080/").as_deref(),
        Some("http://example.com:8080")
    );
    assert_eq!(origin_of("https://u:p@example.com/"), None);
    assert_eq!(origin_of("file:///etc/passwd"), None);
}
