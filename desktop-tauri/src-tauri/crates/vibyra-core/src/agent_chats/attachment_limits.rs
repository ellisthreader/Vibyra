use crate::{
    agentdb::AgentDb,
    error::{CoreError, CoreResult},
};
use std::io::Read;
use std::path::Path;

pub fn load(db: &AgentDb, chat: &str, path: &Path) -> CoreResult<(Vec<u8>, String)> {
    let files = super::attachment_store::list(db, chat)?;
    if files.len() >= 10 {
        return Err(CoreError::InvalidPath(
            "A chat can hold at most 10 attachments.".into(),
        ));
    }
    let mut bytes = Vec::new();
    std::fs::File::open(path)?
        .take(super::attachments::MAX_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > super::attachments::MAX_BYTES
        || files.iter().map(|f| f.bytes).sum::<i64>() + bytes.len() as i64 > 50 * 1024 * 1024
    {
        return Err(CoreError::InvalidPath(
            "Attachments are limited to 25 MiB each and 50 MiB per chat.".into(),
        ));
    }
    let mime = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "image/png"
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        "image/jpeg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "image/gif"
    } else if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") {
        "image/webp"
    } else if bytes.starts_with(b"%PDF-") {
        "application/pdf"
    } else if std::str::from_utf8(&bytes).is_ok() && !bytes.contains(&0) {
        "text/plain"
    } else {
        return Err(CoreError::InvalidPath(
            "Attach a PNG, JPEG, GIF, WebP, PDF or UTF-8 text file.".into(),
        ));
    };
    if mime.starts_with("image/") && bytes.len() > 5 * 1024 * 1024 {
        return Err(CoreError::InvalidPath(
            "Resize this image to 5 MiB or less before attaching it.".into(),
        ));
    }
    Ok((bytes, mime.into()))
}
