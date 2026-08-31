//! The clipboard side of the screenshot tools: copying a capture out, and
//! reading whatever the user copied back in when a terminal pastes.
//!
//! One `arboard` handle serves both directions. On X11 the clipboard owner has
//! to stay alive to serve its data, so the handle is kept for the life of the
//! process rather than opened per call.

use std::borrow::Cow;

use arboard::{Clipboard, ImageData};
use image::{DynamicImage, RgbaImage};
use serde::Serialize;
use tauri::State;

use crate::state::AppState;

use super::screenshot::{screenshot_dir, timestamp_name};
use super::screenshot_png::{check_image_size, png_bytes};

static CLIPBOARD: parking_lot::Mutex<Option<Clipboard>> = parking_lot::const_mutex(None);

fn with_clipboard<T>(
    action: impl FnOnce(&mut Clipboard) -> Result<T, String>,
) -> Result<T, String> {
    let mut clipboard = CLIPBOARD.lock();
    if clipboard.is_none() {
        *clipboard = Some(Clipboard::new().map_err(|e| format!("Could not open clipboard: {e}"))?);
    }
    action(clipboard.as_mut().expect("clipboard initialized"))
}

pub(crate) fn copy_text(text: &str) -> Result<(), String> {
    with_clipboard(|clipboard| {
        clipboard
            .set_text(text.to_owned())
            .map_err(|e| format!("Could not copy to the clipboard: {e}"))
    })
}

pub(super) fn copy_image(image: DynamicImage) -> Result<(), String> {
    let rgba = image.into_rgba8();
    let data = ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        bytes: Cow::Owned(rgba.into_raw()),
    };
    with_clipboard(|clipboard| {
        clipboard
            .set_image(data)
            .map_err(|e| format!("Could not copy screenshot: {e}"))
    })
}

/// Copies a terminal selection out.
///
/// xterm draws its own selection rather than making a DOM one, and the page
/// sets `user-select: none`, so WebKit has nothing of its own to copy — the
/// selected text has to travel through here or it never reaches the clipboard.
#[tauri::command]
pub async fn write_clipboard_text(text: String) -> Result<(), String> {
    super::run_blocking(move || copy_text(&text)).await
}

/// What a terminal paste should insert.
#[derive(Serialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum ClipboardPaste {
    Text {
        text: String,
    },
    /// A bitmap has no form a PTY can carry, so it is written next to the
    /// saved screenshots and pasted as a path the CLI can open.
    Image {
        path: String,
    },
    Empty,
}

fn paste_image(image: ImageData<'_>, dir: std::path::PathBuf) -> Result<ClipboardPaste, String> {
    let width = u32::try_from(image.width).map_err(|_| "The image is too large.".to_string())?;
    let height = u32::try_from(image.height).map_err(|_| "The image is too large.".to_string())?;
    check_image_size(width, height)?;
    let buffer = RgbaImage::from_raw(width, height, image.bytes.into_owned())
        .ok_or_else(|| "The clipboard image could not be read.".to_string())?;
    let bytes = png_bytes(&DynamicImage::ImageRgba8(buffer))?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(timestamp_name("vibyra-paste"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(ClipboardPaste::Image {
        path: path.to_string_lossy().into_owned(),
    })
}

/// Copying out is the half no unit test can reach: it depends on the display
/// server, and on X11 specifically on this process still owning the selection
/// when another one asks for it. Ignored by default because CI is headless —
/// run it on a desktop with `cargo test -- --ignored copies_text_other`.
#[cfg(test)]
mod tests {
    use std::process::Command;

    #[test]
    #[ignore = "needs a display server"]
    fn copies_text_other_processes_can_read() {
        let probe = "vibyra-copy-probe-42";
        super::with_clipboard(|clipboard| {
            clipboard
                .set_text(probe.to_string())
                .map_err(|e| e.to_string())
        })
        .expect("set_text");

        // Read from a separate process while this one still owns the
        // selection — that is exactly the arrangement the app runs in.
        let seen = Command::new("xclip")
            .args(["-o", "-selection", "clipboard"])
            .output()
            .expect("run xclip");
        assert_eq!(String::from_utf8_lossy(&seen.stdout), probe);
    }
}

#[tauri::command]
pub async fn read_clipboard_paste(state: State<'_, AppState>) -> Result<ClipboardPaste, String> {
    let dir = screenshot_dir(&state);
    super::run_blocking(move || {
        // Text wins: an image is only ever the fallback, because copying text
        // from a browser also leaves an HTML flavour that some toolkits
        // advertise as a bitmap.
        if let Ok(text) =
            with_clipboard(|clipboard| clipboard.get_text().map_err(|e| e.to_string()))
        {
            if !text.is_empty() {
                return Ok(ClipboardPaste::Text { text });
            }
        }
        match with_clipboard(|clipboard| clipboard.get_image().map_err(|e| e.to_string())) {
            Ok(image) => paste_image(image, dir),
            Err(_) => Ok(ClipboardPaste::Empty),
        }
    })
    .await
}
