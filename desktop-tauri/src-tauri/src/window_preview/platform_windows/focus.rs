//! Keyboard focus in a shared window, for the phone's own keyboard. UI
//! Automation says what has focus and where the text fields are; the window's
//! blinking caret covers classic controls without it. Field text is never read.

use super::automation::{bounds, read_only, with};
use super::inventory::{dpi_aware, hwnd};
use super::{Field, Focused, Geometry};
use crate::window_preview::native::kind;
use windows::core::BOOL;
use windows::Win32::Foundation::POINT;
use windows::Win32::Graphics::Gdi::ClientToScreen;
use windows::Win32::System::Com::SAFEARRAY;
use windows::Win32::System::Ole::{
    SafeArrayDestroy, SafeArrayGetElement, SafeArrayGetLBound, SafeArrayGetUBound,
};
use windows::Win32::UI::Accessibility::{
    IUIAutomationElement, UIA_ComboBoxControlTypeId, UIA_DocumentControlTypeId,
    UIA_EditControlTypeId,
};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetGUIThreadInfo, GetWindowLongW, GetWindowThreadProcessId, IsChild,
    GUITHREADINFO, GUI_CARETBLINKING, GWL_STYLE,
};

const ES_MULTILINE: i32 = 0x0004;

pub(super) fn focused(window: &Geometry) -> Result<Focused, String> {
    dpi_aware();
    let handle = hwnd(window.info.id);
    // SAFETY: read-only window and thread queries.
    let (front, thread) = unsafe {
        let front = GetForegroundWindow() == handle;
        let mut info = GUITHREADINFO {
            cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
            ..Default::default()
        };
        let known = GetGUIThreadInfo(GetWindowThreadProcessId(handle, None), &mut info).is_ok();
        let inside =
            known && (info.hwndFocus == handle || IsChild(handle, info.hwndFocus).as_bool());
        (front, inside.then_some(info))
    };
    let Some(thread) = thread.filter(|_| front) else {
        return Ok(Focused {
            front,
            identity: "elsewhere".into(),
            field: None,
        });
    };
    let described = with(|automation| {
        let element = unsafe { automation.GetFocusedElement() }.ok()?;
        Some(unsafe { describe(&element, &thread) })
    });
    Ok(match described {
        Some((identity, field)) => Focused {
            front,
            identity,
            field,
        },
        // Without UI Automation, a blinking caret in the window means text entry.
        None => Focused {
            front,
            identity: format!("caret-{:?}", thread.hwndCaret.0),
            field: caret(&thread).map(|rect| Field {
                kind: "text",
                rect: Some(rect),
                caret: Some(rect),
                ..Field::default()
            }),
        },
    })
}

/// A focused element's identity and, when it takes text, the field.
unsafe fn describe(
    element: &IUIAutomationElement,
    thread: &GUITHREADINFO,
) -> (String, Option<Field>) {
    let identity = runtime_id(element).unwrap_or_else(|| "unknown".into());
    let control = element.CurrentControlType().unwrap_or_default();
    let secure = element.CurrentIsPassword().is_ok_and(BOOL::as_bool);
    let read_only = read_only(element);
    let caret = caret(thread);
    let takes_text = secure
        || (control == UIA_EditControlTypeId && read_only != Some(true))
        || ((control == UIA_DocumentControlTypeId || control == UIA_ComboBoxControlTypeId) && read_only == Some(false))
        // Consoles and custom editors draw their own text but keep a caret.
        || (caret.is_some() && read_only != Some(true));
    if !takes_text {
        return (identity, None);
    }
    let text = |value: windows::core::Result<windows::core::BSTR>| {
        value.map(|v| v.to_string()).unwrap_or_default()
    };
    let label = text(element.CurrentName());
    let hints = [
        label.clone(),
        text(element.CurrentLocalizedControlType()),
        text(element.CurrentHelpText()),
        text(element.CurrentAutomationId()),
    ]
    .join(" ");
    let native = element.CurrentNativeWindowHandle().unwrap_or_default();
    let multiline = control == UIA_DocumentControlTypeId
        || (!native.is_invalid() && GetWindowLongW(native, GWL_STYLE) & ES_MULTILINE != 0);
    let rect = element.CurrentBoundingRectangle().ok().and_then(bounds);
    let search = hints.to_lowercase().contains("search box");
    let field = Field {
        kind: kind(secure, multiline, search, &hints),
        rect,
        caret,
        label: label.chars().take(60).collect(),
        empty: None,
    };
    (identity, Some(field))
}

/// The caret a classic control shows while it takes typing, on the screen.
fn caret(thread: &GUITHREADINFO) -> Option<[f64; 4]> {
    if thread.hwndCaret.is_invalid() || thread.flags.0 & GUI_CARETBLINKING.0 == 0 {
        return None;
    }
    let r = thread.rcCaret;
    let mut origin = POINT {
        x: r.left,
        y: r.top,
    };
    // SAFETY: converts a point in a live window's client area.
    unsafe { ClientToScreen(thread.hwndCaret, &mut origin) }
        .as_bool()
        .then(|| {
            [
                origin.x as f64,
                origin.y as f64,
                (r.right - r.left).max(1) as f64,
                (r.bottom - r.top).max(1) as f64,
            ]
        })
}

/// UI Automation's runtime id, stable for an element while it exists.
unsafe fn runtime_id(element: &IUIAutomationElement) -> Option<String> {
    let array: *mut SAFEARRAY = element.GetRuntimeId().ok()?;
    if array.is_null() {
        return None;
    }
    let parts = (|| {
        let (low, high) = (
            SafeArrayGetLBound(array, 1).ok()?,
            SafeArrayGetUBound(array, 1).ok()?,
        );
        let mut parts = Vec::new();
        for index in low..=high.min(low + 16) {
            let mut value = 0i32;
            SafeArrayGetElement(array, &index, &mut value as *mut i32 as *mut _).ok()?;
            parts.push(value.to_string());
        }
        Some(parts.join("."))
    })();
    let _ = SafeArrayDestroy(array);
    parts
}
