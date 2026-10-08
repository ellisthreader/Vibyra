//! Text leaves the Mac gzip-compressed when the phone's browser accepts it.
//! A site's HTML, scripts and styles shrink five to ten times, and every byte
//! saved is a frame the phone's JavaScript bridge and the Cloud relay never
//! carry. Compression happens after origin rewriting, and each chunk is flushed
//! so a large page still streams.
use flate2::{write::GzEncoder, Compression};
use std::io::Write;

/// Whether this response is worth compressing for this request.
pub(super) fn wanted(
    request: &std::collections::HashMap<String, String>,
    content_type: Option<&reqwest::header::HeaderValue>,
    status: u16,
    ranged: bool,
    head: bool,
) -> bool {
    let accepts = request.iter().any(|(name, value)| {
        name.eq_ignore_ascii_case("accept-encoding")
            && value
                .split(',')
                .any(|part| part.trim().split(';').next() == Some("gzip"))
    });
    let kind = content_type
        .and_then(|value| value.to_str().ok())
        .unwrap_or("")
        .to_ascii_lowercase();
    let text = kind.starts_with("text/")
        || ["javascript", "json", "xml", "svg", "wasm"]
            .iter()
            .any(|part| kind.contains(part));
    accepts && text && !ranged && !head && !matches!(status, 101 | 204 | 206 | 304)
}

pub(super) struct Gzip(GzEncoder<Vec<u8>>);

impl Gzip {
    pub(super) fn new() -> Self {
        Self(GzEncoder::new(Vec::new(), Compression::fast()))
    }
    /// Compresses one chunk and returns what is ready to send now.
    pub(super) fn push(&mut self, bytes: &[u8]) -> Result<Vec<u8>, String> {
        self.0.write_all(bytes).map_err(|e| e.to_string())?;
        self.0.flush().map_err(|e| e.to_string())?;
        Ok(std::mem::take(self.0.get_mut()))
    }
    pub(super) fn finish(self) -> Result<Vec<u8>, String> {
        self.0.finish().map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn streamed_chunks_decode_to_the_original_text() {
        let mut gzip = Gzip::new();
        let page = "<p>Hong Kong Express</p>".repeat(4000);
        let mut out = Vec::new();
        for part in page.as_bytes().chunks(8192) {
            out.extend(gzip.push(part).unwrap());
        }
        out.extend(gzip.finish().unwrap());
        assert!(out.len() * 10 < page.len());
        let mut decoded = String::new();
        flate2::read::GzDecoder::new(&out[..])
            .read_to_string(&mut decoded)
            .unwrap();
        assert_eq!(decoded, page);
    }

    #[test]
    fn only_text_the_browser_accepts_is_compressed() {
        let accepts = [(
            "Accept-Encoding".to_string(),
            "gzip, deflate, br".to_string(),
        )]
        .into_iter()
        .collect();
        let none = std::collections::HashMap::new();
        let html = reqwest::header::HeaderValue::from_static("text/html; charset=utf-8");
        let js = reqwest::header::HeaderValue::from_static("text/javascript");
        let image = reqwest::header::HeaderValue::from_static("image/webp");
        assert!(wanted(&accepts, Some(&html), 200, false, false));
        assert!(wanted(&accepts, Some(&js), 200, false, false));
        assert!(!wanted(&accepts, Some(&image), 200, false, false));
        assert!(!wanted(&none, Some(&html), 200, false, false));
        assert!(!wanted(&accepts, Some(&html), 206, true, false));
        assert!(!wanted(&accepts, Some(&html), 200, false, true));
        assert!(!wanted(&accepts, Some(&html), 304, false, false));
    }
}
