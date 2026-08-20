use image::RgbaImage;

pub fn capture_screen_image(
    _window: &tauri::Window,
    _hide_window: bool,
) -> Result<RgbaImage, String> {
    Err("Screenshot capture is not available on this operating system yet.".to_string())
}

pub fn finish_capture_session(_window: &tauri::Window) {}
