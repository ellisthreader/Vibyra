/// A loopback or wildcard listener: its port, and whether it answers only on IPv6
/// (Vite on macOS binds `[::1]` alone by default).
pub(crate) fn listener(name: &str) -> Option<(u16, bool)> {
    let ipv6 = if name.starts_with("[::1]:") || name.starts_with("[::]:") {
        true
    } else if name.starts_with("127.0.0.1:")
        || name.starts_with("*:")
        || name.starts_with("0.0.0.0:")
    {
        false
    } else {
        return None;
    };
    let port = name.rsplit_once(':')?.1.parse::<u16>().ok()?;
    (port > 0).then_some((port, ipv6))
}

/// A redirect to this same local site written out in full — a Rust or Laravel
/// server sends `Location: http://127.0.0.1:8000/menu` — is the path `/menu`.
/// Any other host or port is not followed.
pub(super) fn same_site_path(location: &str, port: u16) -> Option<String> {
    ["127.0.0.1", "localhost", "[::1]"].iter().find_map(|host| {
        let rest = location.strip_prefix(&format!("http://{host}:{port}"))?;
        if rest.is_empty() {
            Some("/".to_owned())
        } else {
            rest.starts_with('/').then(|| rest.to_owned())
        }
    })
}

pub(super) fn probe(port: u16, ipv6: bool) -> Option<String> {
    let mut path = "/".to_owned();
    for _ in 0..3 {
        let (status, headers) = head(port, ipv6, &path)?;
        if status == 200
            && headers.lines().any(|line| {
                line.to_ascii_lowercase()
                    .starts_with("content-type: text/html")
                    || line
                        .to_ascii_lowercase()
                        .starts_with("content-type: application/xhtml+xml")
            })
        {
            // A React Native bundler (Metro, `expo start`) serves a page too, but
            // it is the app's build server, not the project's website.
            return (!bundler(port, ipv6)).then_some(path);
        }
        if !matches!(status, 301 | 302 | 303 | 307 | 308) {
            return None;
        }
        let location = headers.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("location")
                .then(|| value.trim().to_owned())
        })?;
        let location = same_site_path(&location, port).unwrap_or(location);
        if !location.starts_with('/')
            || location.starts_with("//")
            || location.contains('\\')
            || location.contains('#')
            || location.len() > 2048
        {
            return None;
        }
        path = location;
    }
    None
}

fn head(port: u16, ipv6: bool, path: &str) -> Option<(u16, String)> {
    use std::io::{Read, Write};
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
    use std::time::Duration;
    let ip: IpAddr = if ipv6 {
        Ipv6Addr::LOCALHOST.into()
    } else {
        Ipv4Addr::LOCALHOST.into()
    };
    let address = SocketAddr::from((ip, port));
    let mut socket = TcpStream::connect_timeout(&address, Duration::from_millis(1500)).ok()?;
    socket
        .set_read_timeout(Some(Duration::from_millis(1500)))
        .ok()?;
    socket
        .set_write_timeout(Some(Duration::from_millis(1500)))
        .ok()?;
    socket
        .write_all(
            format!(
                "HEAD {path} HTTP/1.1\r\nHost: {}:{port}\r\nConnection: close\r\n\r\n",
                if ipv6 { "[::1]" } else { "127.0.0.1" }
            )
            .as_bytes(),
        )
        .ok()?;
    let mut bytes = Vec::new();
    let mut scratch = [0u8; 2048];
    while bytes.len() < 8192 && !bytes.ends_with(b"\r\n\r\n") {
        let count = socket.read(&mut scratch).ok()?;
        if count == 0 {
            break;
        }
        bytes.extend_from_slice(&scratch[..count]);
        if bytes.windows(4).any(|part| part == b"\r\n\r\n") {
            break;
        }
    }
    let text = String::from_utf8(bytes).ok()?;
    let headers = text.split("\r\n\r\n").next()?.to_owned();
    let status = headers
        .lines()
        .next()?
        .split_whitespace()
        .nth(1)?
        .parse()
        .ok()?;
    Some((status, headers))
}

/// Metro answers `GET /status` with `packager-status:running`; a website does not.
fn bundler(port: u16, ipv6: bool) -> bool {
    use std::io::{Read, Write};
    use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, TcpStream};
    use std::time::Duration;
    let ip: IpAddr = if ipv6 {
        Ipv6Addr::LOCALHOST.into()
    } else {
        Ipv4Addr::LOCALHOST.into()
    };
    let address = SocketAddr::from((ip, port));
    let Ok(mut socket) = TcpStream::connect_timeout(&address, Duration::from_millis(1500)) else {
        return false;
    };
    let _ = socket.set_read_timeout(Some(Duration::from_millis(1500)));
    let host = if ipv6 { "[::1]" } else { "127.0.0.1" };
    let request =
        format!("GET /status HTTP/1.1\r\nHost: {host}:{port}\r\nConnection: close\r\n\r\n");
    if socket.write_all(request.as_bytes()).is_err() {
        return false;
    }
    let mut reply = Vec::new();
    let _ = socket.take(4096).read_to_end(&mut reply);
    String::from_utf8_lossy(&reply).contains("packager-status:running")
}
