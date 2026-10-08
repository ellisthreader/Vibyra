//! The two things the Codex TUI attachment does to its socket, for the private
//! Unix socket (macOS, Linux) and the token-guarded loopback socket (Windows).
use std::{io, time::Duration};

pub(super) trait AttachStream: io::Read + io::Write + Sized {
    /// Blocking with a timeout, for the HTTP upgrade. An accepted socket can
    /// inherit the listener's nonblocking mode.
    fn for_handshake(&self, timeout: Duration) -> io::Result<()>;
    /// Short timeouts and nonblocking, for the live attachment loop.
    fn go_live(&self) -> io::Result<()>;
}

macro_rules! attach_stream {
    ($stream:ty) => {
        impl AttachStream for $stream {
            fn for_handshake(&self, timeout: Duration) -> io::Result<()> {
                self.set_nonblocking(false)?;
                self.set_read_timeout(Some(timeout))?;
                self.set_write_timeout(Some(timeout))
            }
            fn go_live(&self) -> io::Result<()> {
                self.set_read_timeout(Some(Duration::from_secs(2)))?;
                self.set_write_timeout(Some(Duration::from_secs(2)))?;
                self.set_nonblocking(true)
            }
        }
    };
}

#[cfg(unix)]
attach_stream!(std::os::unix::net::UnixStream);
#[cfg(windows)]
attach_stream!(std::net::TcpStream);

/// A fresh bearer secret for one Windows attachment: two v4 UUIDs, 244 random bits.
#[cfg(windows)]
pub(super) fn token() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().simple(),
        uuid::Uuid::new_v4().simple()
    )
}

/// Constant-time comparison of the presented `Authorization` header.
#[cfg_attr(not(windows), allow(dead_code))]
pub(super) fn authorized(header: Option<&str>, token: &str) -> bool {
    let wanted = format!("Bearer {token}");
    let Some(header) = header else { return false };
    header.len() == wanted.len()
        && header
            .bytes()
            .zip(wanted.bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

#[cfg(test)]
mod tests {
    #[test]
    fn only_the_exact_bearer_token_is_accepted() {
        assert!(super::authorized(Some("Bearer abc123"), "abc123"));
        for header in [
            None,
            Some(""),
            Some("Bearer abc12"),
            Some("Bearer abc1234"),
            Some("bearer abc123"),
            Some("abc123"),
        ] {
            assert!(!super::authorized(header, "abc123"), "{header:?}");
        }
    }
}
