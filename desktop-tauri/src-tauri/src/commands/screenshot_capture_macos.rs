//! Capture the pointer's display, using macOS's screen recording permission.
//! CoreGraphics supplies logical display coordinates; screencapture handles
//! Retina pixels and the current system capture implementation.
use core_graphics::display::CGDisplay;
use core_graphics::event::CGEvent;
use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
use image::RgbaImage;
use std::process::Command;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

fn capture_allowed() -> bool {
    // These system APIs take no pointers and are available since macOS 10.15.
    // Request only when the user explicitly invokes the capture command.
    unsafe { CGPreflightScreenCaptureAccess() || CGRequestScreenCaptureAccess() }
}

fn pointer_display() -> Result<CGDisplay, String> {
    let source = CGEventSource::new(CGEventSourceStateID::CombinedSessionState)
        .map_err(|_| "Could not read the Mac pointer position.".to_string())?;
    let event =
        CGEvent::new(source).map_err(|_| "Could not read the Mac pointer position.".to_string())?;
    let (displays, count) = CGDisplay::displays_with_point(event.location(), 1)
        .map_err(|error| format!("Could not find the pointer's display: {error}"))?;
    Ok(if count > 0 {
        CGDisplay::new(displays[0])
    } else {
        CGDisplay::main()
    })
}

fn grab_pointer_monitor() -> Result<RgbaImage, String> {
    let bounds = pointer_display()?.bounds();
    let region = format!(
        "-R{},{},{},{}",
        bounds.origin.x as i64,
        bounds.origin.y as i64,
        bounds.size.width as u64,
        bounds.size.height as u64,
    );
    let directory = tempfile::tempdir().map_err(|error| error.to_string())?;
    let path = directory.path().join("capture.png");
    let output = Command::new("/usr/sbin/screencapture")
        .args(["-x", "-t", "png", &region])
        .arg(&path)
        .output()
        .map_err(|error| format!("Could not start Mac screen capture: {error}"))?;
    if !output.status.success() {
        return Err(format!(
            "Mac screen capture failed: {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    image::open(&path)
        .map(image::DynamicImage::into_rgba8)
        .map_err(|error| format!("Could not read Mac screen capture: {error}"))
}

pub fn capture_screen_image(
    window: &tauri::Window,
    hide_window: bool,
) -> Result<RgbaImage, String> {
    if !capture_allowed() {
        return Err("Allow Vibyra in System Settings > Privacy & Security > Screen Recording, then try again. You may need to reopen Vibyra.".into());
    }
    if hide_window {
        window.hide().map_err(|error| error.to_string())?;
        std::thread::sleep(std::time::Duration::from_millis(80));
    }
    let captured = grab_pointer_monitor();
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
