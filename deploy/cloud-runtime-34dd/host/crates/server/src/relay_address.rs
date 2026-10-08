/** Public relay sockets require TLS; loopback plain WebSockets support tests. */
pub(super) fn validate(address: &str) -> Result<(), String> {
    let parsed = url::Url::parse(address).map_err(|_| "Invalid relay URL")?;
    if parsed.scheme() == "wss"
        || (parsed.scheme() == "ws"
            && matches!(
                parsed.host_str(),
                Some("127.0.0.1" | "localhost" | "[::1]" | "::1")
            ))
    {
        Ok(())
    } else {
        Err("Relay requires wss://; ws:// only permitted for loopback development".into())
    }
}

/// Plaintext diagnostics cannot leave this machine or resolve through DNS.
pub(super) fn is_loopback_diagnostic(address: &str) -> bool {
    url::Url::parse(address).is_ok_and(|url| {
        url.scheme() == "ws"
            && matches!(url.host(),
            Some(url::Host::Ipv4(ip)) if ip.is_loopback())
            || url.scheme() == "ws"
                && matches!(url.host(),
            Some(url::Host::Ipv6(ip)) if ip.is_loopback())
    })
}
