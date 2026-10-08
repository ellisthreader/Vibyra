//! Apple-style capture: choose an area, and a small thumbnail lands in the
//! corner of that screen. The picture is already saved when it appears, so
//! nothing has to be answered. Markup is opt-in and opens the editor window.

use std::sync::Mutex;

use image::DynamicImage;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, State, WebviewUrl,
    WebviewWindowBuilder,
};

use crate::state::AppState;

use super::screenshot::{
    saved_screenshot, saved_screenshot_path, screenshot_dir, set_editor_capture, timestamp_name,
    Screenshot,
};
use super::screenshot_capture::capture_screen_image;
use super::screenshot_png::{decode_png_bytes, png_bytes};

const TOAST: &str = "screenshot-toast";
const EDITOR: &str = "screenshot-editor";
/// Logical width of the thumbnail card; the window adds `PAD` of room for its shadow.
const CARD_WIDTH: f64 = 232.0;
const PAD: f64 = 20.0;
/// Distance between the card and the edge of the usable screen.
const EDGE: f64 = 16.0;

static TOAST_SHOT: Mutex<Option<Screenshot>> = Mutex::new(None);

fn card_height(shot: &Screenshot) -> f64 {
    (CARD_WIDTH * f64::from(shot.height) / f64::from(shot.width.max(1))).clamp(84.0, 188.0)
}

/// Bottom-right of the usable area of the screen the pointer is on, so the
/// Dock and menu bar are never covered and a second display gets its own corner.
fn corner(app: &AppHandle, width: f64, height: f64) -> Option<PhysicalPosition<i32>> {
    let pointer = app.cursor_position().ok();
    let monitor = pointer
        .and_then(|p| app.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())?;
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let right = f64::from(area.position.x) + f64::from(area.size.width);
    let bottom = f64::from(area.position.y) + f64::from(area.size.height);
    // The card sits EDGE from the corner; the window reaches PAD beyond the card.
    let x = right - (EDGE - PAD + width) * scale;
    let y = bottom - (EDGE - PAD + height) * scale;
    Some(PhysicalPosition::new(x.round() as i32, y.round() as i32))
}

fn build_toast(app: &AppHandle, width: f64, height: f64) -> Result<tauri::WebviewWindow, String> {
    let build = || {
        WebviewWindowBuilder::new(
            app,
            TOAST,
            WebviewUrl::App("index.html?screenshot-toast=1".into()),
        )
        .title("Vibyra Screenshot")
        .inner_size(width, height)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .focused(false)
        .visible(false)
        .build()
    };
    // A toast closed a moment ago can still hold its label.
    build()
        .or_else(|_| {
            std::thread::sleep(std::time::Duration::from_millis(250));
            build()
        })
        .map_err(|error| error.to_string())
}

fn show_toast(app: &AppHandle, shot: Screenshot) -> Result<(), String> {
    let width = CARD_WIDTH + PAD * 2.0;
    let height = card_height(&shot) + PAD * 2.0;
    *TOAST_SHOT.lock().map_err(|e| e.to_string())? = Some(shot);
    let position = corner(app, width, height);
    let fresh = app.get_webview_window(TOAST).is_none();
    let window = match app.get_webview_window(TOAST) {
        Some(window) => window,
        None => build_toast(app, width, height)?,
    };
    window
        .set_size(LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    if let Some(position) = position {
        window.set_position(position).map_err(|e| e.to_string())?;
    }
    window.show().map_err(|e| e.to_string())?;
    // A new page reads the shot when it mounts; a live one is told to reload it.
    if !fresh {
        app.emit_to(TOAST, "screenshot-toast:shot", ())
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Capture, save, and show the corner thumbnail. Cancelling the selection is
/// an error the caller treats as silence.
#[tauri::command]
pub async fn capture_screenshot_quick(
    app: AppHandle,
    state: State<'_, AppState>,
    window: tauri::Window,
    selection: Option<bool>,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Capture must start from the main window".into());
    }
    let hide_window = state.settings.lock().screenshot_hide_window;
    let dir = screenshot_dir(&state);
    let shot = tauri::async_runtime::spawn_blocking(move || {
        let image = DynamicImage::ImageRgba8(capture_screen_image(
            &window,
            hide_window,
            selection.unwrap_or(false),
        )?);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join(timestamp_name("vibyra"));
        std::fs::write(&path, png_bytes(&image)?).map_err(|e| e.to_string())?;
        saved_screenshot(&path, &image)
    })
    .await
    .map_err(|e| e.to_string())??;
    show_toast(&app, shot)
}

#[tauri::command]
pub fn screenshot_toast_shot(window: tauri::Window) -> Result<Screenshot, String> {
    if window.label() != TOAST {
        return Err("Only the screenshot thumbnail can read this".into());
    }
    TOAST_SHOT
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "No screenshot is waiting".to_string())
}

#[tauri::command]
pub fn close_screenshot_toast(window: tauri::Window) -> Result<(), String> {
    if window.label() != TOAST {
        return Err("Only the screenshot thumbnail can close itself".into());
    }
    if let Ok(mut shot) = TOAST_SHOT.lock() {
        *shot = None;
    }
    window.close().map_err(|e| e.to_string())
}

/// Opens the saved shot in the editor window, then puts the thumbnail away.
#[tauri::command]
pub async fn open_screenshot_markup(
    state: State<'_, AppState>,
    window: tauri::Window,
    path: String,
) -> Result<(), String> {
    if window.label() != TOAST {
        return Err("Markup opens from the screenshot thumbnail".into());
    }
    let app = window.app_handle().clone();
    if let Some(editor) = app.get_webview_window(EDITOR) {
        let _ = editor.set_focus();
        return Err("Finish the screenshot that is already open first.".into());
    }
    let dir = screenshot_dir(&state);
    let image = super::run_blocking(move || {
        let bytes =
            std::fs::read(saved_screenshot_path(&dir, &path)?).map_err(|e| e.to_string())?;
        Ok(decode_png_bytes(&bytes)?.into_rgba8())
    })
    .await?;
    set_editor_capture(&image)?;
    WebviewWindowBuilder::new(
        &app,
        EDITOR,
        WebviewUrl::App("index.html?screenshot-editor=1".into()),
    )
    .title("Vibyra Screenshot")
    .inner_size(1180.0, 780.0)
    .min_inner_size(760.0, 520.0)
    .center()
    .decorations(true)
    .resizable(true)
    .background_color(tauri::window::Color(14, 15, 18, 255))
    .build()
    .map_err(|e| e.to_string())?;
    close_screenshot_toast(window)
}
