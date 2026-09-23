use std::path::{Path, PathBuf};
use std::time::Duration;

const PREFIX: &str = "attached-port:";

pub(super) fn root_path() -> String {
    "/".into()
}

pub(crate) fn start_path(value: &str) -> Result<String, String> {
    if value.len() > 2048
        || !value.starts_with('/')
        || value.starts_with("//")
        || value.contains('\\')
        || value.contains('#')
        || value.chars().any(char::is_control)
    {
        return Err("Invalid attached Preview path".into());
    }
    Ok(value.into())
}

/// A standing approval for one loopback port. The Mac owner chooses the port;
/// the phone only receives an opaque grant ID and cannot choose another host.
pub(super) fn port(target_id: &str) -> Result<Option<u16>, String> {
    let Some(raw) = target_id.strip_prefix(PREFIX) else {
        return Ok(None);
    };
    let parsed = raw
        .parse::<u16>()
        .map_err(|_| "Invalid attached Preview port")?;
    if parsed == 0 || raw != parsed.to_string() {
        return Err("Invalid attached Preview port".into());
    }
    Ok(Some(parsed))
}

pub(super) fn identity(root: &Path, port: u16) -> Result<(PathBuf, String), String> {
    let canonical = root.canonicalize().map_err(|e| e.to_string())?;
    if !canonical.is_dir() {
        return Err("Preview project folder is unavailable".into());
    }
    Ok((canonical, format!("attached-loopback-v1:{port}")))
}

pub(crate) fn origin(port: u16) -> Result<reqwest::Url, String> {
    let address = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    std::net::TcpStream::connect_timeout(&address, Duration::from_millis(300))
        .map_err(|_| "The approved local server is not running on the Mac")?;
    reqwest::Url::parse(&format!("http://127.0.0.1:{port}/"))
        .map_err(|_| "Invalid attached Preview origin".into())
}

#[cfg(test)]
mod tests {
    use super::{port, start_path};

    #[test]
    fn only_canonical_nonzero_loopback_ports_are_attachments() {
        assert_eq!(port("attached-port:8001").unwrap(), Some(8001));
        assert_eq!(port("static-site").unwrap(), None);
        for invalid in [
            "attached-port:0",
            "attached-port:08001",
            "attached-port:-1",
            "attached-port:65536",
            "attached-port:8001/path",
            "attached-port:localhost:8001",
        ] {
            assert!(port(invalid).is_err(), "{invalid}");
        }
    }

    #[test]
    fn only_local_paths_can_be_saved_as_opening_routes() {
        assert_eq!(
            start_path("/menu?allergen=soy").unwrap(),
            "/menu?allergen=soy"
        );
        for invalid in [
            "",
            "http://127.0.0.1:8001/menu",
            "//other.invalid/",
            "/a\\b",
            "/a\nb",
            "/menu#x",
        ] {
            assert!(start_path(invalid).is_err(), "{invalid}");
        }
    }
}
