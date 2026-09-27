//! X11 registration is not evidence of system-wide shortcuts on Wayland.
#[tauri::command]
pub fn native_shortcuts_available(window: tauri::Window) -> bool {
    #[cfg(target_os = "linux")]
    {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        let x11_window = window.window_handle().is_ok_and(|handle| {
            matches!(
                handle.as_raw(),
                RawWindowHandle::Xlib(_) | RawWindowHandle::Xcb(_)
            )
        });
        x11_available(
            x11_window,
            std::env::var("DISPLAY").ok().as_deref(),
            std::env::var("WAYLAND_DISPLAY").ok().as_deref(),
            std::env::var("XDG_SESSION_TYPE").ok().as_deref(),
        )
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = window;
        true
    }
}

#[cfg(any(target_os = "linux", test))]
fn x11_available(
    x11_window: bool,
    display: Option<&str>,
    wayland: Option<&str>,
    session: Option<&str>,
) -> bool {
    x11_window
        && display.is_some_and(|value| !value.trim().is_empty())
        && !wayland.is_some_and(|value| !value.trim().is_empty())
        && !session.is_some_and(|value| value.trim().eq_ignore_ascii_case("wayland"))
}

#[cfg(test)]
mod tests {
    use super::x11_available;

    #[test]
    fn an_xwayland_window_does_not_claim_system_wide_registration() {
        assert!(!x11_available(
            true,
            Some(":0"),
            Some("wayland-0"),
            Some("x11")
        ));
        assert!(!x11_available(true, Some(":0"), None, Some("wayland")));
        assert!(!x11_available(false, Some(":0"), None, Some("x11")));
    }

    #[test]
    fn only_a_real_x11_session_uses_the_existing_plugin() {
        assert!(x11_available(true, Some(":0"), None, Some("x11")));
        assert!(x11_available(true, Some(":0"), Some(""), None));
        assert!(!x11_available(true, None, None, None));
    }
}
