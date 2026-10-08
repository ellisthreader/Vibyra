//! The Agent browser's only way out: a loopback HTTP proxy Chrome must use
//! for every connection (`--proxy-server` with `<-loopback>`, QUIC off).
//! It checks the granted origin, resolves the host once, refuses local and
//! private addresses, and connects to exactly the vetted address. HTTPS and
//! WebSockets tunnel through CONNECT; plain HTTP is forwarded one request
//! per connection so a reused connection can never reach another host.

use super::policy::Policy;
use std::io::{Read, Write};
use std::net::{Shutdown, SocketAddr, TcpListener, TcpStream};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

pub struct Proxy {
    pub port: u16,
    stop: Arc<AtomicBool>,
}

impl Proxy {
    pub fn start(policy: Arc<Policy>) -> std::io::Result<Proxy> {
        let listener = TcpListener::bind("127.0.0.1:0")?;
        let port = listener.local_addr()?.port();
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        std::thread::spawn(move || {
            for stream in listener.incoming() {
                if flag.load(Ordering::SeqCst) {
                    return;
                }
                let Ok(stream) = stream else { continue };
                let policy = policy.clone();
                std::thread::spawn(move || {
                    let _ = serve(stream, &policy);
                });
            }
        });
        Ok(Proxy { port, stop })
    }
}

impl Drop for Proxy {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        let _ = TcpStream::connect(("127.0.0.1", self.port));
    }
}

fn head(stream: &mut TcpStream) -> std::io::Result<(Vec<u8>, usize)> {
    let mut buf = Vec::with_capacity(2048);
    let mut chunk = [0u8; 2048];
    loop {
        if let Some(end) = buf.windows(4).position(|w| w == b"\r\n\r\n") {
            return Ok((buf, end + 4));
        }
        if buf.len() > 32 * 1024 {
            return Err(std::io::ErrorKind::InvalidData.into());
        }
        let n = stream.read(&mut chunk)?;
        if n == 0 {
            return Err(std::io::ErrorKind::UnexpectedEof.into());
        }
        buf.extend_from_slice(&chunk[..n]);
    }
}

fn refuse(mut client: TcpStream, why: &str) -> std::io::Result<()> {
    let body = format!("Blocked by Vibyra: {why}");
    let reply = format!(
        "HTTP/1.1 403 Forbidden\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    client.write_all(reply.as_bytes())
}

fn connect(policy: &Policy, host: &str, port: u16) -> Result<TcpStream, String> {
    let addrs = policy.resolve(host, port)?;
    addrs
        .iter()
        .find_map(|addr: &SocketAddr| {
            TcpStream::connect_timeout(addr, Duration::from_secs(10)).ok()
        })
        .ok_or_else(|| format!("{host} did not answer"))
}

fn serve(mut client: TcpStream, policy: &Policy) -> std::io::Result<()> {
    client.set_read_timeout(Some(Duration::from_secs(30)))?;
    let (buf, end) = head(&mut client)?;
    let text = String::from_utf8_lossy(&buf[..end]).to_string();
    let mut lines = text.split("\r\n");
    let first: Vec<&str> = lines.next().unwrap_or_default().split(' ').collect();
    let [method, target, version] = first[..] else {
        return refuse(client, "malformed request");
    };
    if method == "CONNECT" {
        let (host, port) = match target.rsplit_once(':').map(|(h, p)| (h, p.parse::<u16>())) {
            Some((h, Ok(p))) => (h.to_owned(), p),
            _ => return refuse(client, "malformed tunnel"),
        };
        if !policy.allows_host(&host, port, &["https", "http"]) {
            policy.note_blocked(format!("{host}:{port} (not an allowed site)"));
            return refuse(client, "not an allowed site");
        }
        let upstream = match connect(policy, &host, port) {
            Ok(up) => up,
            Err(why) => return refuse(client, &why),
        };
        client.write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")?;
        return pipe(client, upstream, &buf[end..]);
    }
    let Ok(url) = url::Url::parse(target) else {
        return refuse(client, "not a proxied address");
    };
    let origin = super::policy::origin_of(target);
    if url.scheme() != "http" || !origin.as_deref().is_some_and(|o| policy.allows_origin(o)) {
        policy.note_blocked(format!(
            "{} (not an allowed site)",
            origin.unwrap_or_else(|| "address".into())
        ));
        return refuse(client, "not an allowed site");
    }
    let (host, port) = (
        url.host_str().unwrap_or_default().to_owned(),
        url.port_or_known_default().unwrap_or(80),
    );
    let upstream = match connect(policy, &host, port) {
        Ok(up) => up,
        Err(why) => return refuse(client, &why),
    };
    let path = &url[url::Position::BeforePath..];
    // The Host header always names the vetted target: a client that forges it
    // cannot steer a name-based virtual host the policy never checked.
    let authority = match url.port() {
        Some(port) => format!("{host}:{port}"),
        None => host.clone(),
    };
    let mut out = format!("{method} {path} {version}\r\nHost: {authority}\r\n");
    for line in lines.filter(|l| !l.is_empty()) {
        let name = line
            .split(':')
            .next()
            .unwrap_or_default()
            .to_ascii_lowercase();
        if !matches!(
            name.as_str(),
            "host" | "proxy-connection" | "proxy-authorization" | "connection" | "keep-alive"
        ) {
            out.push_str(line);
            out.push_str("\r\n");
        }
    }
    out.push_str("Connection: close\r\n\r\n");
    let mut first = out.into_bytes();
    first.extend_from_slice(&buf[end..]);
    pipe(client, upstream, &first)
}

/// Copies both ways until either side closes, then closes both.
fn pipe(client: TcpStream, mut upstream: TcpStream, first: &[u8]) -> std::io::Result<()> {
    upstream.write_all(first)?;
    client.set_read_timeout(None)?;
    let (mut c_read, mut u_write) = (client.try_clone()?, upstream.try_clone()?);
    let up = std::thread::spawn(move || {
        let _ = std::io::copy(&mut c_read, &mut u_write);
        let _ = u_write.shutdown(Shutdown::Write);
    });
    let mut c_write = client;
    let _ = std::io::copy(&mut upstream, &mut c_write);
    let _ = c_write.shutdown(Shutdown::Both);
    let _ = upstream.shutdown(Shutdown::Both);
    let _ = up.join();
    Ok(())
}
