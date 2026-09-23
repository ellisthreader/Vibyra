pub(super) fn listener_port(name: &str) -> Option<u16> {
    if !name.starts_with("127.0.0.1:") && !name.starts_with("*:") && !name.starts_with("0.0.0.0:") {
        return None;
    }
    let port = name.rsplit_once(':')?.1.parse::<u16>().ok()?;
    (port > 0).then_some(port)
}

#[cfg(target_os = "macos")]
pub(super) fn probe(port: u16) -> Option<String> {
    let mut path = "/".to_owned();
    for _ in 0..3 {
        let (status, headers) = head(port, &path)?;
        if status == 200
            && headers.lines().any(|line| {
                line.to_ascii_lowercase()
                    .starts_with("content-type: text/html")
                    || line
                        .to_ascii_lowercase()
                        .starts_with("content-type: application/xhtml+xml")
            })
        {
            return Some(path);
        }
        if !matches!(status, 301 | 302 | 303 | 307 | 308) {
            return None;
        }
        let location = headers.lines().find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("location")
                .then(|| value.trim().to_owned())
        })?;
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

#[cfg(target_os = "macos")]
fn head(port: u16, path: &str) -> Option<(u16, String)> {
    use std::io::{Read, Write};
    use std::net::{SocketAddr, TcpStream};
    use std::time::Duration;
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut socket = TcpStream::connect_timeout(&address, Duration::from_millis(300)).ok()?;
    socket
        .set_read_timeout(Some(Duration::from_millis(300)))
        .ok()?;
    socket
        .set_write_timeout(Some(Duration::from_millis(300)))
        .ok()?;
    socket
        .write_all(
            format!("HEAD {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n")
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
