//! The smallest HTTPS client account mode needs: one JSON POST with a bearer
//! token. rustls with the ring provider and bundled web roots, so the cloud
//! image needs no OpenSSL and no system certificate store. Plain http is
//! accepted only for a loopback address, which tests and local diagnostics use.
use serde_json::Value;
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
};

const LIMIT: usize = 256 * 1024;
const TIMEOUT: Duration = Duration::from_secs(20);

pub(crate) struct Target {
    pub tls: bool,
    pub host: String,
    pub port: u16,
    pub path: String,
}

/// Fail closed on anything but https, or http to a loopback host.
pub(crate) fn parse(url: &str) -> Result<Target, String> {
    let parsed = url::Url::parse(url).map_err(|_| "Invalid account API address")?;
    let host = parsed
        .host_str()
        .ok_or("Invalid account API address")?
        .trim_matches(|c| c == '[' || c == ']')
        .to_owned();
    let loopback = host == "localhost"
        || host
            .parse::<std::net::IpAddr>()
            .is_ok_and(|ip| ip.is_loopback());
    let tls = match parsed.scheme() {
        "https" => true,
        "http" if loopback => false,
        _ => return Err("The account API address must use https".into()),
    };
    if !parsed.username().is_empty() || parsed.password().is_some() || parsed.query().is_some() {
        return Err("Invalid account API address".into());
    }
    Ok(Target {
        tls,
        port: parsed
            .port_or_known_default()
            .ok_or("Invalid account API address")?,
        host,
        path: parsed.path().trim_end_matches('/').to_owned(),
    })
}

/// POSTs `body` to `{base}{path}` and returns the status and parsed JSON
/// (`Null` when the reply is not JSON). The token is never put in an error.
pub(crate) async fn post_json(
    base: &str,
    path: &str,
    bearer: &str,
    body: &Value,
) -> Result<(u16, Value), String> {
    let target = parse(base)?;
    let payload = serde_json::to_vec(body).map_err(|e| e.to_string())?;
    let request = format!(
        "POST {}{} HTTP/1.1\r\nHost: {}\r\nAuthorization: Bearer {}\r\nAccept: application/json\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nUser-Agent: vibyra-host/{}\r\n\r\n",
        target.path, path, target.host, bearer, payload.len(), env!("CARGO_PKG_VERSION")
    );
    let exchange = async {
        let tcp = TcpStream::connect((target.host.as_str(), target.port))
            .await
            .map_err(|_| "Cannot reach the Vibyra account API")?;
        if target.tls {
            static PROVIDER: std::sync::Once = std::sync::Once::new();
            PROVIDER.call_once(|| {
                let _ = rustls::crypto::ring::default_provider().install_default();
            });
            let mut roots = rustls::RootCertStore::empty();
            roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
            let config = rustls::ClientConfig::builder()
                .with_root_certificates(roots)
                .with_no_client_auth();
            let name = tokio_rustls::rustls::pki_types::ServerName::try_from(target.host.clone())
                .map_err(|_| "Invalid account API address")?;
            let stream = tokio_rustls::TlsConnector::from(Arc::new(config))
                .connect(name, tcp)
                .await
                .map_err(|_| "Secure connection to the Vibyra account API failed")?;
            exchange(stream, &request, &payload).await
        } else {
            exchange(tcp, &request, &payload).await
        }
    };
    let raw = tokio::time::timeout(TIMEOUT, exchange)
        .await
        .map_err(|_| "The Vibyra account API timed out")??;
    parse_response(&raw)
}

async fn exchange<S: AsyncReadExt + AsyncWriteExt + Unpin>(
    mut stream: S,
    request: &str,
    payload: &[u8],
) -> Result<Vec<u8>, String> {
    let fail = |_| "The Vibyra account API connection failed".to_owned();
    stream.write_all(request.as_bytes()).await.map_err(fail)?;
    stream.write_all(payload).await.map_err(fail)?;
    stream.flush().await.map_err(fail)?;
    let mut raw = Vec::new();
    // `Connection: close` ends the reply with EOF; an abrupt TLS close after a
    // complete reply is not an error.
    let mut chunk = [0u8; 8192];
    loop {
        match stream.read(&mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                raw.extend_from_slice(&chunk[..n]);
                if raw.len() > LIMIT {
                    return Err("The Vibyra account API reply is too large".into());
                }
            }
        }
    }
    Ok(raw)
}

fn parse_response(raw: &[u8]) -> Result<(u16, Value), String> {
    let split = raw
        .windows(4)
        .position(|w| w == b"\r\n\r\n")
        .ok_or("Invalid reply from the Vibyra account API")?;
    let head = String::from_utf8_lossy(&raw[..split]).to_string();
    let mut lines = head.split("\r\n");
    let status: u16 = lines
        .next()
        .and_then(|line| line.split(' ').nth(1))
        .and_then(|code| code.parse().ok())
        .ok_or("Invalid reply from the Vibyra account API")?;
    let chunked = lines.any(|line| {
        let line = line.to_ascii_lowercase();
        line.starts_with("transfer-encoding:") && line.contains("chunked")
    });
    let body = &raw[split + 4..];
    let body = if chunked {
        dechunk(body)?
    } else {
        body.to_vec()
    };
    Ok((status, serde_json::from_slice(&body).unwrap_or(Value::Null)))
}

fn dechunk(mut data: &[u8]) -> Result<Vec<u8>, String> {
    let bad = || "Invalid reply from the Vibyra account API".to_owned();
    let mut out = Vec::new();
    loop {
        let line_end = data.windows(2).position(|w| w == b"\r\n").ok_or_else(bad)?;
        let size = std::str::from_utf8(&data[..line_end])
            .ok()
            .and_then(|s| usize::from_str_radix(s.split(';').next()?.trim(), 16).ok())
            .ok_or_else(bad)?;
        data = &data[line_end + 2..];
        if size == 0 {
            return Ok(out);
        }
        if data.len() < size + 2 {
            return Err(bad());
        }
        out.extend_from_slice(&data[..size]);
        data = &data[size + 2..];
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_https_or_loopback_http_is_accepted() {
        assert!(parse("https://api.vibyra.app").unwrap().tls);
        assert!(!parse("http://127.0.0.1:8010").unwrap().tls);
        assert!(!parse("http://[::1]:8010/x").unwrap().tls);
        for bad in [
            "http://api.vibyra.app",
            "ftp://x",
            "https://u:p@x.app",
            "nonsense",
        ] {
            assert!(parse(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn chunked_and_plain_replies_parse() {
        let chunked =
            b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n7\r\n{\"a\":1}\r\n0\r\n\r\n";
        assert_eq!(
            parse_response(chunked).unwrap(),
            (200, serde_json::json!({"a":1}))
        );
        let plain = b"HTTP/1.1 409 Conflict\r\nContent-Length: 9\r\n\r\n{\"b\":\"c\"}";
        assert_eq!(parse_response(plain).unwrap().0, 409);
        assert!(parse_response(b"garbage").is_err());
    }
}
