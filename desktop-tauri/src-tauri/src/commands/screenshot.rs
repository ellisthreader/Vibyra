use std::path::{Path, PathBuf};

use base64::Engine;
use image::DynamicImage;
use serde::Serialize;
use std::sync::Mutex;
use tauri::State;

use crate::state::AppState;

use super::clipboard::copy_image;
use super::screenshot_capture::{capture_screen_image, finish_capture_session};
use super::screenshot_png::{decode_png, decode_png_bytes, png_bytes, PNG_PREFIX};

static EDITOR_CAPTURE: Mutex<Option<Vec<u8>>> = Mutex::new(None);

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

pub(super) fn screenshot_dir(state: &AppState) -> PathBuf {
    state
        .settings
        .lock()
        .screenshot_dir
        .clone()
        .map(PathBuf::from)
        .unwrap_or_else(default_dir)
}

pub(super) fn timestamp_name(prefix: &str) -> String {
    let now = time::OffsetDateTime::now_utc();
    format!(
        "{prefix}-{:04}{:02}{:02}-{:02}{:02}{:02}-{:03}.png",
        now.year(),
        u8::from(now.month()),
        now.day(),
        now.hour(),
        now.minute(),
        now.second(),
        now.millisecond()
    )
}

/// Resolves a path the UI handed back, but only inside the screenshot folder.
pub(super) fn saved_screenshot_path(dir: &Path, path: &str) -> Result<PathBuf, String> {
    let root = std::fs::canonicalize(dir).map_err(|e| e.to_string())?;
    let target = std::fs::canonicalize(path).map_err(|e| e.to_string())?;
    if !target.starts_with(root) {
        return Err("The screenshot is outside Vibyra's screenshot folder.".to_string());
    }
    Ok(target)
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
pub async fn capture_screen_for_editor(
    state: State<'_, AppState>,
    window: tauri::Window,
    selection: Option<bool>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Capture must start from the main window".into());
    }
    let hide_window = state.settings.lock().screenshot_hide_window;
    tauri::async_runtime::spawn_blocking(move || {
        let image = capture_screen_image(&window, hide_window, selection.unwrap_or(false))?;
        let mut bytes = Vec::with_capacity(12 + image.as_raw().len());
        bytes.extend_from_slice(b"VSH\x01");
        bytes.extend_from_slice(&image.width().to_be_bytes());
        bytes.extend_from_slice(&image.height().to_be_bytes());
        bytes.extend_from_slice(image.as_raw());
        *EDITOR_CAPTURE.lock().map_err(|e| e.to_string())? = Some(bytes);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn take_screenshot_editor_capture(
    window: tauri::Window,
) -> Result<tauri::ipc::Response, String> {
    if window.label() != "screenshot-editor" {
        return Err("Only the screenshot editor can read this capture".into());
    }
    let bytes = EDITOR_CAPTURE
        .lock()
        .map_err(|e| e.to_string())?
        .take()
        .ok_or("No screenshot is waiting to be edited")?;
    Ok(tauri::ipc::Response::new(bytes))
}

#[tauri::command]
pub fn finish_screenshot_edit(window: tauri::Window) {
    if let Ok(mut capture) = EDITOR_CAPTURE.lock() {
        *capture = None;
    }
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
        let path = dir.join(timestamp_name("vibyra"));
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
        let target = saved_screenshot_path(&dir, &path)?;
        let bytes = std::fs::read(target).map_err(|e| e.to_string())?;
        let image = decode_png_bytes(&bytes)
            .map_err(|_| "The saved screenshot could not be decoded.".to_string())?;
        copy_image(image)
    })
    .await
    .map_err(|e| e.to_string())?
}
