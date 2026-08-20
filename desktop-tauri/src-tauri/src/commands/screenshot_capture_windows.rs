//! Windows screen capture for the screenshot shortcut.
//!
//! Mirrors the X11 contract: the grab is what is on the monitor under the
//! pointer, Vibyra included, unless `screenshot_hide_window` is set.

use image::RgbaImage;
use std::path::Path;
use std::process::Command;

/// Long enough for the desktop compositor to finish the hide animation, and
/// only paid for when the user opts into hiding the window.
const COMPOSITOR_SETTLE_MS: u64 = 80;
const CAPTURE_SCRIPT: &str = r#"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$point = [System.Windows.Forms.Cursor]::Position
$screen = [System.Windows.Forms.Screen]::FromPoint($point)
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try {
  $graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $bitmap.Save($env:VIBYRA_CAPTURE_PATH, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $graphics.Dispose()
  $bitmap.Dispose()
}
"#;

fn capture_path() -> std::path::PathBuf {
    let stamp = time::OffsetDateTime::now_utc().unix_timestamp_nanos();
    std::env::temp_dir().join(format!("vibyra-capture-{}-{stamp}.png", std::process::id()))
}

fn grab_pointer_monitor(path: &Path) -> Result<RgbaImage, String> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoLogo",
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            CAPTURE_SCRIPT,
        ])
        .env("VIBYRA_CAPTURE_PATH", path)
        .output()
        .map_err(|error| format!("Could not start Windows screen capture: {error}"))?;
    if !output.status.success() {
        let detail = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Windows screen capture failed: {}", detail.trim()));
    }
    image::open(path)
        .map(image::DynamicImage::into_rgba8)
        .map_err(|error| format!("Could not read Windows screen capture: {error}"))
}

pub fn capture_screen_image(
    window: &tauri::Window,
    hide_window: bool,
) -> Result<RgbaImage, String> {
    if hide_window {
        window.hide().map_err(|error| error.to_string())?;
        std::thread::sleep(std::time::Duration::from_millis(COMPOSITOR_SETTLE_MS));
    }
    let path = capture_path();
    let captured = grab_pointer_monitor(&path);
    let _ = std::fs::remove_file(&path);
    if hide_window {
        let _ = window.show();
    }
    let _ = window.unminimize();
    let _ = window.set_focus();
    captured
}

pub fn finish_capture_session(window: &tauri::Window) {
    let _ = window.show();
}
