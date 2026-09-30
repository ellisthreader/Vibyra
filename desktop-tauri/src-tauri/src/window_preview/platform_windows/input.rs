//! Input to a shared window, only when it is the window the user is looking
//! at on the PC: foreground, focused, unmoved and on top where the tap lands.

use super::desktop::input_desktop_is_default;
use super::effects::{key, mouse, send_checked as effects};
use super::inventory::{bounds, dpi_aware, hwnd};
use super::{Geometry, InputEvent};
use crate::window_preview::native::Key;
use windows::Win32::Foundation::POINT;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    KEYBD_EVENT_FLAGS, KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, KEYEVENTF_UNICODE,
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_WHEEL, VIRTUAL_KEY, VK_BACK, VK_DELETE, VK_DOWN, VK_ESCAPE, VK_LEFT, VK_NEXT,
    VK_PRIOR, VK_RETURN, VK_RIGHT, VK_SHIFT, VK_TAB, VK_UP,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetAncestor, GetForegroundWindow, GetGUIThreadInfo, GetWindowThreadProcessId, IsChild,
    IsIconic, SetCursorPos, WindowFromPoint, GA_ROOT, GUITHREADINFO,
};

pub(super) fn send(window: &Geometry, event: &InputEvent) -> Result<(), String> {
    send_checked(window, event, &crate::window_preview::input_guard::denied)
}

pub(super) fn send_checked(
    window: &Geometry,
    event: &InputEvent,
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<(), String> {
    check()?;
    dpi_aware();
    let handle = hwnd(window.info.id);
    if !input_desktop_is_default() {
        return Err(
            "Unlock your PC and close any security prompt before controlling this window.".into(),
        );
    }
    super::desktop::bring_to_front(handle, check)?;
    // SAFETY: read-only window and thread queries.
    unsafe {
        if IsIconic(handle).as_bool() {
            return Err("The window is minimized. Restore it on your PC to control it.".into());
        }
        if GetForegroundWindow() != handle {
            return Err("Bring the shared application window to the front on your PC before controlling it.".into());
        }
        let thread = GetWindowThreadProcessId(handle, None);
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        let focused = GetGUIThreadInfo(thread, &mut info).is_ok()
            && (info.hwndFocus == handle || IsChild(handle, info.hwndFocus).as_bool());
        if !focused {
            return Err(
                "A different window or dialog has focus. Return to the shared window on your PC."
                    .into(),
            );
        }
    }
    let now = bounds(handle, false).ok_or("This window cannot be safely targeted for input.")?;
    if (now.left as f64 - window.x).abs() >= 1.0 || (now.top as f64 - window.y).abs() >= 1.0 {
        return Err("The window moved. Close and reopen Preview to control it.".into());
    }
    if super::identity::more_trusted(window.info.pid as u32) {
        return Err(
            "This window runs as administrator. Vibyra can show it but not control it.".into(),
        );
    }
    let inputs = match event {
        InputEvent::Click { x, y, right } => {
            aim(handle, window, *x, *y, check)?;
            let (down, up) = if *right {
                (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP)
            } else {
                (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP)
            };
            vec![mouse(down, 0), mouse(up, 0)]
        }
        InputEvent::Scroll { x, y, delta } => {
            aim(handle, window, *x, *y, check)?;
            // 120 is one wheel notch; the phone sends pixels, about 100 a notch.
            vec![mouse(MOUSEEVENTF_WHEEL, delta * 6 / 5)]
        }
        InputEvent::Text(units) => units
            .iter()
            .flat_map(|unit| {
                [
                    key(VIRTUAL_KEY(0), *unit, KEYEVENTF_UNICODE),
                    key(VIRTUAL_KEY(0), *unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
                ]
            })
            .collect(),
        InputEvent::Key(which) => {
            let (code, extended) = match which {
                Key::Enter => (VK_RETURN, false),
                Key::Tab | Key::ShiftTab => (VK_TAB, false),
                Key::Escape => (VK_ESCAPE, false),
                Key::Backspace => (VK_BACK, false),
                Key::Delete => (VK_DELETE, true),
                Key::Left => (VK_LEFT, true),
                Key::Right => (VK_RIGHT, true),
                Key::Up => (VK_UP, true),
                Key::Down => (VK_DOWN, true),
                Key::PageUp => (VK_PRIOR, true),
                Key::PageDown => (VK_NEXT, true),
            };
            let flags = if extended {
                KEYEVENTF_EXTENDEDKEY
            } else {
                KEYBD_EVENT_FLAGS(0)
            };
            let pressed = vec![key(code, 0, flags), key(code, 0, flags | KEYEVENTF_KEYUP)];
            if *which == Key::ShiftTab {
                let mut chord = vec![key(VK_SHIFT, 0, KEYBD_EVENT_FLAGS(0))];
                chord.extend(pressed);
                chord.push(key(VK_SHIFT, 0, KEYEVENTF_KEYUP));
                chord
            } else {
                pressed
            }
        }
        // The dispatcher sends a batch one action at a time.
        InputEvent::Keys(_) => return Err("Unsupported window input.".into()),
    };
    effects(&inputs, check)
}

/// Moves the pointer to the tap, refusing if a menu or another window is on
/// top there.
fn aim(
    handle: windows::Win32::Foundation::HWND,
    window: &Geometry,
    x: f64,
    y: f64,
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<(), String> {
    let (px, py) = super::super::input::point(window, x, y);
    let point = POINT {
        x: px.round() as i32,
        y: py.round() as i32,
    };
    // SAFETY: plain pointer and window queries.
    unsafe {
        if GetAncestor(WindowFromPoint(point), GA_ROOT) != handle {
            return Err(
                "Another window or menu is in front. Return to the shared window on your PC."
                    .into(),
            );
        }
        check()?;
        SetCursorPos(point.x, point.y).map_err(|e| e.message())
    }
}
