/// Replace the approved Mac site's address in text responses with the phone's
/// private loopback origin, preserving matches split across network chunks.
///
/// Sites name themselves in more ways than one exact origin: Laravel, Inertia and
/// Ziggy embed JSON-escaped URLs (`http:\/\/127.0.0.1:8001\/img.png`), and a
/// site configured as `localhost` or dialled on `[::1]` names that host. Each
/// form leaves the phone for a port that exists only on the Mac, so the host and
/// port are rewritten wherever they appear and the surrounding scheme or
/// escaping is kept. A longer port (`:80011`) or host (`my127.0.0.1`) is left alone.
pub(super) struct OriginRewriter {
    sources: Vec<Vec<u8>>,
    destination: Vec<u8>,
    longest: usize,
    pending: Vec<u8>,
    previous: Option<u8>,
}

impl OriginRewriter {
    /// `port` is the Mac site's; `destination` the phone's `http://127.0.0.1:<port>`.
    pub fn new(port: u16, destination: &str) -> Self {
        let sources = ["127.0.0.1", "localhost", "[::1]"]
            .map(|host| format!("{host}:{port}").into_bytes())
            .to_vec();
        let destination = destination
            .strip_prefix("http://")
            .unwrap_or(destination)
            .as_bytes()
            .to_vec();
        let longest = sources.iter().map(Vec::len).max().unwrap_or(0);
        Self {
            sources,
            destination,
            longest,
            pending: Vec::new(),
            previous: None,
        }
    }

    pub fn push(&mut self, input: &[u8]) -> Vec<u8> {
        self.pending.extend_from_slice(input);
        self.drain(false)
    }

    pub fn finish(mut self) -> Vec<u8> {
        self.drain(true)
    }

    fn drain(&mut self, last: bool) -> Vec<u8> {
        // A match needs the byte after it, so an unfinished stream holds back
        // anything that could still start one.
        let limit = if last {
            self.pending.len()
        } else {
            self.pending.len().saturating_sub(self.longest)
        };
        let mut result = Vec::with_capacity(self.pending.len());
        let mut cursor = 0;
        while cursor < limit {
            let before = cursor
                .checked_sub(1)
                .map(|index| self.pending[index])
                .or(self.previous);
            match self.match_at(cursor, before) {
                Some(length) => {
                    result.extend_from_slice(&self.destination);
                    cursor += length;
                }
                None => {
                    result.push(self.pending[cursor]);
                    cursor += 1;
                }
            }
        }
        if cursor > 0 {
            self.previous = Some(self.pending[cursor - 1]);
        }
        self.pending.drain(..cursor);
        result
    }

    fn match_at(&self, at: usize, before: Option<u8>) -> Option<usize> {
        if before.is_some_and(|byte| byte.is_ascii_alphanumeric() || byte == b'.' || byte == b'-') {
            return None;
        }
        let rest = &self.pending[at..];
        self.sources
            .iter()
            .find(|source| {
                rest.starts_with(source)
                    && !rest
                        .get(source.len())
                        .is_some_and(|next| next.is_ascii_digit())
            })
            .map(Vec::len)
    }
}

pub(super) fn browser_origin(value: Option<&str>) -> Result<String, String> {
    let value = value.ok_or("Phone Preview origin is missing")?;
    let url = reqwest::Url::parse(value).map_err(|_| "Invalid phone Preview origin")?;
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port().is_none()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || value != url.origin().ascii_serialization()
    {
        return Err("Invalid phone Preview origin".into());
    }
    Ok(value.into())
}

pub(super) fn rewritable(content_type: Option<&reqwest::header::HeaderValue>) -> bool {
    let Some(value) = content_type.and_then(|value| value.to_str().ok()) else {
        return false;
    };
    let mime = value
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    matches!(
        mime.as_str(),
        "text/html"
            | "text/css"
            | "text/javascript"
            | "text/xml"
            | "image/svg+xml"
            | "application/json"
            | "application/javascript"
            | "application/xml"
            | "application/xhtml+xml"
            | "application/manifest+json"
    ) || mime.ends_with("+json")
}

#[cfg(test)]
#[path = "origin_rewrite_tests.rs"]
mod tests;
