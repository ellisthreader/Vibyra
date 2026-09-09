//! Native Mac capture, invoked only by the user's screenshot action.
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use image::RgbaImage;
use tauri::Window;

use super::screenshot_png::decode_png_bytes;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

struct CaptureDirectory(PathBuf);
impl CaptureDirectory {
    fn new() -> Result<Self, String> {
        use std::os::unix::fs::DirBuilderExt;
        let mut random = [0_u8; 16];
        getrandom::fill(&mut random).map_err(|error| error.to_string())?;
        let name: String = random.iter().map(|byte| format!("{byte:02x}")).collect();
        let path = std::env::temp_dir().join(format!("vibyra-capture-{name}"));
        std::fs::DirBuilder::new()
            .mode(0o700)
            .create(&path)
            .map_err(|error| error.to_string())?;
        Ok(Self(path))
    }
}
impl Drop for CaptureDirectory {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

/// Restore the original window even if the capture fails or is denied.
struct HiddenWindow<'a>(&'a Window, bool);
impl Drop for HiddenWindow<'_> {
    fn drop(&mut self) {
        if self.1 {
            let _ = self.0.show();
        }
    }
}

pub fn capture_screen_image(window: &Window, hide_window: bool) -> Result<RgbaImage, String> {
    // These public CoreGraphics calls enforce the OS's consent boundary;
    // starting the app never requests this permission.
    if unsafe { !CGPreflightScreenCaptureAccess() && !CGRequestScreenCaptureAccess() } {
        return Err("Allow Vibyra in System Settings → Privacy & Security → Screen & System Audio Recording, then try again.".into());
    }
    let directory = CaptureDirectory::new()?;
    let path = directory.0.join("capture.png");
    let hide = hide_window && window.is_visible().map_err(|error| error.to_string())?;
    let restore = HiddenWindow(window, hide);
    if hide {
        window.hide().map_err(|error| error.to_string())?;
        std::thread::sleep(Duration::from_millis(150));
    }
    // The main display is deterministic across Dock, menu and shortcut entry.
    let mut child = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-m", "-t", "png"])
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start macOS screen capture: {error}"))?;
    let deadline = Instant::now() + Duration::from_secs(10);
    loop {
        match child.try_wait() {
            Ok(Some(status)) if status.success() => break,
            Ok(Some(_)) => return Err("macOS could not capture the display. Check Vibyra's Screen & System Audio Recording permission.".into()),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(20)),
            result => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(result.err().map_or_else(|| "macOS screen capture timed out. Try again.".into(), |error| error.to_string()));
            }
        }
    }
    let bytes = std::fs::read(&path).map_err(|error| error.to_string())?;
    let image = decode_png_bytes(&bytes)?.into_rgba8();
    drop(restore);
    // Bring the editor forward only after the screen has been captured.
    let _ = window.show();
    let _ = window.set_focus();
    Ok(image)
}

pub fn finish_capture_session(_window: &Window) {}
