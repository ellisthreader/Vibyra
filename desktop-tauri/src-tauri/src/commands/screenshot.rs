use std::borrow::Cow;
use std::path::{Path, PathBuf};

use arboard::{Clipboard, ImageData};
use base64::Engine;
use image::DynamicImage;
use serde::Serialize;
use tauri::State;

use crate::state::AppState;

use super::screenshot_capture::{capture_screen_image, finish_capture_session};
use super::screenshot_png::{decode_png, decode_png_bytes, png_bytes, PNG_PREFIX};

static SCREENSHOT_CLIPBOARD: parking_lot::Mutex<Option<Clipboard>> = parking_lot::const_mutex(None);
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub path: String,
    pub width: u32,
    pub height: u32,
    pub thumb_data_url: String,
}

fn default_dir() -> PathBuf {
    dirs::picture_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Vibyra")
}

fn screenshot_dir(state: &AppState) -> PathBuf {
    state
        .settings
        .lock()
        .screenshot_dir
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(default_dir)
}

fn timestamp_name() -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "vibyra-{:04}{:02}{:02}-{:02}{:02}{:02}-{:03}.png",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.millisecond()
    )
}

fn copy_image(image: DynamicImage) -> Result<(), String> {
    let rgba = image.into_rgba8();
    let data = ImageData {
        width: rgba.width() as usize,
        height: rgba.height() as usize,
        bytes: Cow::Owned(rgba.into_raw()),
    };
    let mut clipboard = SCREENSHOT_CLIPBOARD.lock();
    if clipboard.is_none() {
        *clipboard = Some(Clipboard::new().map_err(|e| format!("Could not open clipboard: {e}"))?);
    }
    clipboard
        .as_mut()
        .expect("clipboard initialized")
        .set_image(data)
        .map_err(|e| format!("Could not copy screenshot: {e}"))
}

fn saved_screenshot(path: &Path, image: &DynamicImage) -> Result<Screenshot, String> {
    let thumb = image.thumbnail(360, 240);
    let thumb_data_url = format!(
        "{PNG_PREFIX}{}",
        base64::engine::general_purpose::STANDARD.encode(png_bytes(&thumb)?)
    );
    Ok(Screenshot {
        path: path.to_string_lossy().into_owned(),
        width: image.width(),
        height: image.height(),
        thumb_data_url,
    })
}

#[tauri::command]
pub async fn capture_screen(
    state: State<'_, AppState>,
    window: tauri::Window,
) -> Result<tauri::ipc::Response, String> {
    let hide_window = state.settings.lock().screenshot_hide_window;
    tauri::async_runtime::spawn_blocking(move || {
        let image = capture_screen_image(&window, hide_window)?;
        let mut response = Vec::with_capacity(12 + image.as_raw().len());
        response.extend_from_slice(b"VSH\x01");
        response.extend_from_slice(&image.width().to_be_bytes());
        response.extend_from_slice(&image.height().to_be_bytes());
        response.extend_from_slice(image.as_raw());
        Ok(tauri::ipc::Response::new(response))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn finish_screenshot_edit(window: tauri::Window) {
    finish_capture_session(&window);
}

#[tauri::command]
pub async fn copy_screenshot(data_url: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        decode_png(&data_url).and_then(|(_, image)| copy_image(image))
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_screenshot(
    state: State<'_, AppState>,
    data_url: String,
) -> Result<Screenshot, String> {
    let dir = screenshot_dir(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let (bytes, image) = decode_png(&data_url)?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(timestamp_name());
        std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
        saved_screenshot(&path, &image)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn copy_saved_screenshot(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let dir = screenshot_dir(&state);
    tauri::async_runtime::spawn_blocking(move || {
        let root = std::fs::canonicalize(&dir).map_err(|e| e.to_string())?;
        let target = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
        if !target.starts_with(root) {
            return Err("The screenshot is outside Vibyra's screenshot folder.".to_string());
        }
        let bytes = std::fs::read(target).map_err(|e| e.to_string())?;
        let image = decode_png_bytes(&bytes)
            .map_err(|_| "The saved screenshot could not be decoded.".to_string())?;
        copy_image(image)
    })
    .await
    .map_err(|e| e.to_string())?
}
