//! Exact target focus immediately before each new OS input effect.
use super::inventory::hwnd;
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, IsChild, IsIconic,
    GUITHREADINFO,
};

/// A text batch can outlive focus; check the exact target before every new effect.
pub(super) fn focused(id: u32) -> Result<(), String> {
    let handle = hwnd(id);
    // SAFETY: read-only window and thread queries; the handle never leaves this call.
    unsafe {
        if IsIconic(handle).as_bool() || GetForegroundWindow() != handle {
            return Err("Bring the shared application window to the front on your PC before controlling it.".into());
        }
        let thread = GetWindowThreadProcessId(handle, None);
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        if thread == 0
            || GetGUIThreadInfo(thread, &mut info).is_err()
            || !(info.hwndFocus == handle || IsChild(handle, info.hwndFocus).as_bool())
        {
            return Err(
                "A different window or dialog has focus. Return to the shared window on your PC."
                    .into(),
            );
        }
    }
    Ok(())
}
