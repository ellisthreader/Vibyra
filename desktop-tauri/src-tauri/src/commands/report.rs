//! The command behind the in-app report dialog.
//!
//! Two things happen here that deliberately do not happen in the webview: the
//! screenshot is decoded and, if need be, shrunk to something Discord will
//! accept, and the terminal tail is read straight from the PTY manager. Both
//! would otherwise mean moving megabytes through IPC to describe them.

use image::DynamicImage;
use tauri::State;

use super::run_blocking;
use super::screenshot_png::{decode_png, png_bytes};
use crate::discord::MAX_ATTACHMENT_BYTES;
use crate::report::{configured_webhook, deliver, validate, Report};
use crate::report_image::load_all;
use crate::report_text::terminal_tail;
use crate::state::AppState;

/// Leaves room for `context.txt` and the multipart framing inside Discord's
/// per-message ceiling.
const MAX_SCREENSHOT_BYTES: usize = MAX_ATTACHMENT_BYTES - 512 * 1024;

/// Whether reporting is available at all, so the UI can say so up front rather
/// than after the user has written a paragraph.
#[tauri::command]
pub async fn report_channel_ready() -> Result<bool, String> {
    run_blocking(|| Ok(configured_webhook()?.is_some())).await
}

#[tauri::command]
pub async fn submit_report(state: State<'_, AppState>, report: Report) -> Result<String, String> {
    validate(&report)?;
    let webhook = configured_webhook()?.ok_or_else(|| {
        "Reporting is not connected yet — ask the maintainer to run `npm run report:configure`"
            .to_string()
    })?;
    // Read before any await: the pane can exit while the user is still typing,
    // and a report is worth more than the output it could not collect.
    let tail = report
        .session_id
        .and_then(|id| state.manager.snapshot(id).ok())
        .map(|snapshot| terminal_tail(&snapshot))
        .filter(|tail| !tail.is_empty());
    let shot = report.screenshot.clone();
    let screenshot = match shot {
        Some(data_url) => Some(run_blocking(move || prepare_screenshot(&data_url)).await?),
        None => None,
    };
    // Read off the async runtime: these are the reporter's own files, and one
    // of them being on a slow disk must not stall a runtime worker.
    let paths = report.image_paths.clone();
    let images = run_blocking(move || load_all(&paths)).await?;
    deliver(&webhook, &report, screenshot, images, tail).await
}

/// Decodes the editor's PNG and brings it under Discord's ceiling if it is
/// over. A report screenshot only has to be legible, so halving the longest
/// edge is a better trade than refusing to send the report at all.
fn prepare_screenshot(data_url: &str) -> Result<Vec<u8>, String> {
    let (bytes, image) = decode_png(data_url)?;
    if bytes.len() <= MAX_SCREENSHOT_BYTES {
        return Ok(bytes);
    }
    shrink_to_fit(image)
}

fn shrink_to_fit(image: DynamicImage) -> Result<Vec<u8>, String> {
    let mut current = image;
    for _ in 0..4 {
        let width = (current.width() / 2).max(640);
        let height = (current.height() / 2).max(360);
        current = current.thumbnail(width, height);
        let bytes = png_bytes(&current)?;
        if bytes.len() <= MAX_SCREENSHOT_BYTES {
            return Ok(bytes);
        }
        if current.width() <= 640 {
            break;
        }
    }
    Err("That screenshot is too large to attach — crop it and try again".into())
}
