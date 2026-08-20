use std::fs;
use std::path::{Component, Path, PathBuf};

pub(crate) fn requested_file(root: &Path, entry: &Path, uri: &str) -> Option<PathBuf> {
    let raw = uri.split(['?', '#']).next().unwrap_or("/");
    let decoded = percent_decode(raw)?;
    let relative = decoded.trim_start_matches('/');
    let safe = Path::new(relative);
    if safe
        .components()
        .any(|part| matches!(part, Component::ParentDir | Component::Prefix(_)))
    {
        return None;
    }
    let mut candidate = if relative.is_empty() {
        entry.to_owned()
    } else {
        root.join(safe)
    };
    if candidate.is_dir() {
        candidate = candidate.join("index.html");
    }
    if !candidate.is_file() && safe.extension().is_none() {
        candidate = entry.to_owned();
    }
    let canonical_root = fs::canonicalize(root).ok()?;
    let canonical = fs::canonicalize(candidate).ok()?;
    canonical.starts_with(&canonical_root).then_some(canonical)
}

fn percent_decode(input: &str) -> Option<String> {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = bytes.get(index + 1..index + 3)?;
            let text = std::str::from_utf8(hex).ok()?;
            output.push(u8::from_str_radix(text, 16).ok()?);
            index += 3;
        } else {
            output.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(output).ok()
}

pub(crate) fn mime_type(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
    {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "json" | "map" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "gif" => "image/gif",
        "ico" => "image/x-icon",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "wasm" => "application/wasm",
        "mp4" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        "webmanifest" => "application/manifest+json",
        "pdf" => "application/pdf",
        "txt" => "text/plain; charset=utf-8",
        "xml" => "application/xml",
        _ => "application/octet-stream",
    }
}
