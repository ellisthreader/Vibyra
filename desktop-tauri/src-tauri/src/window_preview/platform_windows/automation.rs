//! One UI Automation client per thread, and the element facts both the focus
//! report and the text-field map read.

use windows::core::BOOL;
use windows::Win32::Foundation::RECT;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED,
};
use windows::Win32::UI::Accessibility::{
    CUIAutomation, IUIAutomation, IUIAutomationElement, IUIAutomationValuePattern,
    UIA_ValuePatternId,
};

thread_local! {
    // In the multithreaded apartment; created on the thread's first use.
    static AUTOMATION: Option<IUIAutomation> = unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()
    };
}

/// Runs `work` with this thread's client; None when UI Automation is missing.
pub(super) fn with<T>(work: impl FnOnce(&IUIAutomation) -> Option<T>) -> Option<T> {
    AUTOMATION.with(|automation| automation.as_ref().and_then(work))
}

/// Whether the element's value refuses edits; None when it has no value.
pub(super) unsafe fn read_only(element: &IUIAutomationElement) -> Option<bool> {
    element
        .GetCurrentPatternAs::<IUIAutomationValuePattern>(UIA_ValuePatternId)
        .ok()
        .and_then(|pattern| pattern.CurrentIsReadOnly().ok())
        .map(BOOL::as_bool)
}

/// A screen rectangle as `[x, y, width, height]`; None when empty.
pub(super) fn bounds(r: RECT) -> Option<[f64; 4]> {
    (r.right > r.left && r.bottom > r.top).then(|| {
        [
            r.left as f64,
            r.top as f64,
            (r.right - r.left) as f64,
            (r.bottom - r.top) as f64,
        ]
    })
}
