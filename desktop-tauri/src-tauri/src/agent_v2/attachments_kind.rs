//! What an attachment is: the allowlist (declared type, then the bytes must
//! be that type), the label shown to Claude, and the generated file name.

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Kind {
    /// The media type Claude's image block needs (taken from the bytes).
    Image(&'static str),
    Pdf,
    Text,
}

/// Allowlist by declared type, then the bytes must really be that type.
pub fn classify(content_type: &str, bytes: &[u8]) -> Result<Kind, &'static str> {
    let declared = content_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let kind = match declared.as_str() {
        "image/jpeg" => Kind::Image("image/jpeg"),
        "image/png" => Kind::Image("image/png"),
        "image/gif" => Kind::Image("image/gif"),
        "image/webp" => Kind::Image("image/webp"),
        "application/pdf" => Kind::Pdf,
        "text/plain" => Kind::Text,
        _ => return Err("is a kind of file Agents cannot read (photos, PDFs and text only)"),
    };
    if bytes.is_empty() {
        return Err("is empty");
    }
    let genuine = match kind {
        Kind::Image("image/jpeg") => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        Kind::Image("image/png") => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        Kind::Image("image/gif") => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        Kind::Image(_) => bytes.len() > 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        Kind::Pdf => bytes.starts_with(b"%PDF-"),
        Kind::Text => !bytes.contains(&0) && std::str::from_utf8(bytes).is_ok(),
    };
    if genuine {
        Ok(kind)
    } else {
        Err("does not match the kind of file it claims to be")
    }
}

/// A name to show Claude: the last path part, letters, digits and `. - _ ( )`
/// only, at most 60 characters. Never used to name anything on disk.
pub fn label(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let kept: String = base
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '.' | '-' | '_' | '(' | ')'))
        .collect();
    let words = kept.split_whitespace().collect::<Vec<_>>().join(" ");
    let short: String = words.chars().take(60).collect();
    let short = short.trim_matches(['.', ' ']);
    if short.is_empty() { "unnamed" } else { short }.to_owned()
}

/// `attachment-<n>-<sha256 prefix>.<ext>`: generated, nothing from the upload.
pub fn file_name(index: usize, sha256: &str, kind: Kind) -> String {
    let extension = match kind {
        Kind::Image("image/jpeg") => "jpg",
        Kind::Image("image/png") => "png",
        Kind::Image("image/gif") => "gif",
        Kind::Image(_) => "webp",
        Kind::Pdf => "pdf",
        Kind::Text => "txt",
    };
    let prefix: String = sha256
        .chars()
        .filter(char::is_ascii_hexdigit)
        .take(8)
        .collect();
    format!("attachment-{}-{prefix}.{extension}", index + 1)
}

#[cfg(test)]
#[path = "attachments_kind_tests.rs"]
mod tests;
