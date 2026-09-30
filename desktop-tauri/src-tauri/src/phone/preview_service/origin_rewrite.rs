/// Replace an approved Mac loopback origin in text responses with the phone's
/// private loopback origin, preserving matches split across network chunks.
pub(super) struct OriginRewriter {
    source: Vec<u8>,
    destination: Vec<u8>,
    pending: Vec<u8>,
}

impl OriginRewriter {
    pub fn new(source: &str, destination: &str) -> Self {
        Self {
            source: source.as_bytes().to_vec(),
            destination: destination.as_bytes().to_vec(),
            pending: Vec::new(),
        }
    }

    pub fn push(&mut self, input: &[u8]) -> Vec<u8> {
        self.pending.extend_from_slice(input);
        let limit = self
            .pending
            .len()
            .saturating_sub(self.source.len().saturating_sub(1));
        let mut result = Vec::with_capacity(self.pending.len());
        let mut cursor = 0;
        while cursor < limit {
            let next = self.pending[cursor..]
                .windows(self.source.len())
                .position(|window| window == self.source.as_slice())
                .filter(|relative| cursor + relative < limit);
            let Some(relative) = next else {
                break;
            };
            let found = cursor + relative;
            result.extend_from_slice(&self.pending[cursor..found]);
            result.extend_from_slice(&self.destination);
            cursor = found + self.source.len();
        }
        let safe = limit.max(cursor);
        result.extend_from_slice(&self.pending[cursor..safe]);
        self.pending.drain(..safe);
        result
    }

    pub fn finish(self) -> Vec<u8> {
        self.pending
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
mod tests {
    use super::{browser_origin, OriginRewriter};

    #[test]
    fn rewrites_split_absolute_urls_without_touching_other_origins() {
        let mut rewrite = OriginRewriter::new("http://127.0.0.1:8001", "http://127.0.0.1:55331");
        let mut output = rewrite.push(b"<img src=\"http://127.0.0.");
        output.extend(rewrite.push(b"1:8001/menu\"> http://127.0.0.1:9000"));
        output.extend(rewrite.finish());
        assert_eq!(
            String::from_utf8(output).unwrap(),
            "<img src=\"http://127.0.0.1:55331/menu\"> http://127.0.0.1:9000"
        );
    }

    #[test]
    fn accepts_only_exact_phone_loopback_origin() {
        assert_eq!(
            browser_origin(Some("http://127.0.0.1:55331")).unwrap(),
            "http://127.0.0.1:55331"
        );
        for invalid in [
            None,
            Some("http://localhost:55331"),
            Some("http://127.0.0.1:55331/path"),
            Some("https://127.0.0.1:55331"),
            Some("http://127.0.0.1:55331@other.invalid"),
        ] {
            assert!(browser_origin(invalid).is_err());
        }
    }
}
