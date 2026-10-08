//! Images a reporter attached — picked from disk, or pasted from the clipboard
//! (which Vibyra already spools to a file, so both arrive here as a path).

use std::path::Path;

use crate::discord::{Attachment, MAX_ATTACHMENT_BYTES};

/// Discord takes ten files per message. Vibyra spends one on `context.txt` and
/// one on the annotated screenshot, and stops well short of the rest: past a
/// handful a report stops being a report and becomes an album.
pub(crate) const MAX_IMAGES: usize = 4;

/// Recognises an image by its magic number rather than its name.
///
/// A file called `.png` that is really a video, and a clipboard spool file
/// with no extension at all, both have to be answered correctly — and trusting
/// the extension would let a report upload whatever it was pointed at.
pub(crate) fn sniff(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some("image/png");
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some("image/gif");
    }
    if bytes.len() > 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.starts_with(b"BM") {
        return Some("image/bmp");
    }
    None
}

fn extension_for(mime: &str) -> &'static str {
    match mime {
        "image/jpeg" => ".jpg",
        "image/gif" => ".gif",
        "image/webp" => ".webp",
        "image/bmp" => ".bmp",
        _ => ".png",
    }
}

/// A file name Discord and a maintainer's filesystem will both accept.
///
/// The reporter's own name for the file is worth keeping — "login-error.png"
/// says something "image-2.png" does not — but it arrives from their disk, so
/// only a conservative subset of it survives, and the extension is set from
/// what the bytes actually are.
fn safe_name(path: &Path, index: usize, mime: &str) -> String {
    let stem = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(40)
        .collect::<String>();
    let stem = if stem.is_empty() {
        format!("image-{}", index + 1)
    } else {
        stem
    };
    format!("{stem}{}", extension_for(mime))
}

/// Reads one attached image, refusing anything that is not one.
///
/// Failures name the file: a report that will not send is only actionable if
/// the user can tell which of the four things they attached is the problem.
pub(crate) fn load(path: &str, index: usize) -> Result<Attachment, String> {
    let path = Path::new(path);
    let shown = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("that file")
        .to_owned();
    let bytes =
        std::fs::read(path).map_err(|_| format!("Vibyra could not read {shown} to attach it"))?;
    if bytes.len() > MAX_ATTACHMENT_BYTES {
        return Err(format!("{shown} is larger than the 8 MB Discord accepts"));
    }
    let Some(mime) = sniff(&bytes) else {
        return Err(format!("{shown} is not an image Discord can display"));
    };
    Ok(Attachment {
        file_name: safe_name(path, index, mime),
        mime,
        bytes,
    })
}

/// Loads every attached image, stopping at the ceiling.
pub(crate) fn load_all(paths: &[String]) -> Result<Vec<Attachment>, String> {
    if paths.len() > MAX_IMAGES {
        return Err(format!("Attach at most {MAX_IMAGES} images to one report"));
    }
    paths
        .iter()
        .enumerate()
        .map(|(index, path)| load(path, index))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{load, load_all, safe_name, sniff, MAX_IMAGES};
    use std::path::Path;

    #[test]
    fn an_image_is_recognised_by_its_bytes_not_its_name() {
        assert_eq!(sniff(b"\x89PNG\r\n\x1a\n rest"), Some("image/png"));
        assert_eq!(sniff(&[0xff, 0xd8, 0xff, 0xe0]), Some("image/jpeg"));
        assert_eq!(sniff(b"GIF89a..."), Some("image/gif"));
        assert_eq!(sniff(b"RIFF....WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff(b"#!/bin/sh\n"), None);
        assert_eq!(sniff(b""), None);
    }

    #[test]
    fn a_file_named_png_that_is_not_one_is_refused() {
        let dir = std::env::temp_dir().join("vibyra-report-image-test");
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("screenshot.png");
        std::fs::write(&path, b"not an image at all").unwrap();
        let error = load(path.to_str().unwrap(), 0).unwrap_err();
        assert!(error.contains("screenshot.png"));
        assert!(error.contains("not an image"));
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn the_reporters_own_file_name_survives_but_the_extension_is_ours() {
        // Their name for it carries meaning; the extension has to match what
        // the bytes actually are, not what the file claimed.
        let name = safe_name(Path::new("/home/u/login error!!.jpeg"), 0, "image/png");
        assert_eq!(name, "loginerror.png");
        // Nothing usable left in the name still yields a valid file name.
        assert_eq!(
            safe_name(Path::new("/tmp/。。。"), 2, "image/jpeg"),
            "image-3.jpg"
        );
    }

    #[test]
    fn a_report_cannot_become_an_album() {
        let paths: Vec<String> = (0..MAX_IMAGES + 1)
            .map(|n| format!("/tmp/{n}.png"))
            .collect();
        assert!(load_all(&paths).unwrap_err().contains("at most"));
    }
}
