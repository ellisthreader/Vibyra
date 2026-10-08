//! Application windows and their identity: pid, process creation time and
//! window handle. Windows on other virtual desktops are listed, as the Mac
//! lists other Spaces.

use super::Geometry;
use crate::window_preview::WindowInfo;
use std::ffi::c_void;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{
    DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS,
};
use windows::Win32::UI::HiDpi::{
    SetThreadDpiAwarenessContext, DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetClassNameW, GetWindow, GetWindowDisplayAffinity, GetWindowLongPtrW,
    GetWindowPlacement, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindow,
    IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WINDOWPLACEMENT, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

const MAX_WINDOWS: usize = 256;
const MIN_SIZE: f64 = 32.0;
/// Cloaked by its own app or an ancestor: not a window anyone can see. The
/// shell cloaks windows on other virtual desktops; those stay listed.
const CLOAKED_HIDDEN: u32 = 0x1 | 0x4;
const CLOAKED_SHELL: u32 = 0x2;
const SHELL_CLASSES: [&str; 3] = ["Progman", "WorkerW", "Shell_TrayWnd"];

/// Window handles are 32-bit significant and sign-extended.
pub(super) fn hwnd(id: u32) -> HWND {
    HWND(id as i32 as isize as *mut c_void)
}

fn id(hwnd: HWND) -> Option<u32> {
    let value = hwnd.0 as isize;
    (value == value as i32 as isize && value != 0).then_some(value as i32 as u32)
}

/// Bounds and cursor positions in physical pixels, whatever the display scale.
pub(super) fn dpi_aware() {
    // SAFETY: changes only this thread's DPI mode.
    unsafe {
        let _ = SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
    }
}

pub(super) fn list() -> Result<Vec<Geometry>, String> {
    dpi_aware();
    let mut handles: Vec<HWND> = Vec::new();
    unsafe extern "system" fn collect(hwnd: HWND, list: LPARAM) -> BOOL {
        // SAFETY: `list` is the Vec below, alive for the whole enumeration.
        let list = unsafe { &mut *(list.0 as *mut Vec<HWND>) };
        list.push(hwnd);
        BOOL(1)
    }
    // SAFETY: the callback only pushes into `handles`.
    unsafe {
        EnumWindows(
            Some(collect),
            LPARAM(&mut handles as *mut Vec<HWND> as isize),
        )
    }
    .map_err(|e| e.to_string())?;
    Ok(handles
        .into_iter()
        .filter_map(describe)
        .take(MAX_WINDOWS)
        .collect())
}

pub(super) fn info(id: u32) -> Result<Geometry, String> {
    dpi_aware();
    let handle = hwnd(id);
    // SAFETY: IsWindow accepts any value.
    let alive = unsafe { IsWindow(Some(handle)) }.as_bool();
    alive.then(|| describe(handle)).flatten().ok_or_else(|| {
        "This application window closed or is unavailable. Select it again on your PC.".into()
    })
}

fn describe(handle: HWND) -> Option<Geometry> {
    let id = id(handle)?;
    // SAFETY: read-only queries on a window handle; failures are skipped.
    unsafe {
        let iconic = IsIconic(handle).as_bool();
        if !IsWindowVisible(handle).as_bool() && !iconic {
            return None;
        }
        let style = GetWindowLongPtrW(handle, GWL_EXSTYLE) as u32;
        let owned = GetWindow(handle, GW_OWNER).is_ok_and(|owner| !owner.is_invalid());
        if style & WS_EX_TOOLWINDOW.0 != 0 || (owned && style & WS_EX_APPWINDOW.0 == 0) {
            return None;
        }
        let mut class = [0u16; 64];
        let length = GetClassNameW(handle, &mut class).max(0) as usize;
        if SHELL_CLASSES.contains(&String::from_utf16_lossy(&class[..length]).as_str()) {
            return None;
        }
        if cloaked(handle) & CLOAKED_HIDDEN != 0 {
            return None;
        }
        let rect = bounds(handle, iconic)?;
        let (width, height) = (
            (rect.right - rect.left) as f64,
            (rect.bottom - rect.top) as f64,
        );
        if width < MIN_SIZE || height < MIN_SIZE {
            return None;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(handle, Some(&mut pid));
        let (created, name) = super::identity::process(pid)?;
        let mut title = [0u16; 512];
        let length = GetWindowTextW(handle, &mut title).max(0) as usize;
        Some(Geometry {
            info: WindowInfo {
                id,
                pid: pid as i32,
                name,
                title: String::from_utf16_lossy(&title[..length]),
                fingerprint: format!("{pid}:{created}:{id}"),
            },
            x: rect.left as f64,
            y: rect.top as f64,
            width,
            height,
        })
    }
}

fn cloaked(handle: HWND) -> u32 {
    let mut value = 0u32;
    // SAFETY: DWM writes one u32.
    let _ =
        unsafe { DwmGetWindowAttribute(handle, DWMWA_CLOAKED, (&mut value as *mut u32).cast(), 4) };
    value
}

/// The visible frame without its drop shadow; a minimized window keeps the
/// size it will be restored to, so its identity does not "resize".
pub(super) fn bounds(handle: HWND, iconic: bool) -> Option<RECT> {
    let mut rect = RECT::default();
    // SAFETY: each call writes one fixed-size structure.
    unsafe {
        if iconic {
            let mut placement = WINDOWPLACEMENT {
                length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
                ..Default::default()
            };
            GetWindowPlacement(handle, &mut placement).ok()?;
            return Some(placement.rcNormalPosition);
        }
        let size = std::mem::size_of::<RECT>() as u32;
        DwmGetWindowAttribute(
            handle,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            (&mut rect as *mut RECT).cast(),
            size,
        )
        .ok()?;
    }
    Some(rect)
}

/// Apps can ask Windows to keep their windows out of every capture.
pub(super) fn capturable(id: u32) -> Result<(), String> {
    let mut affinity = 0u32;
    // SAFETY: writes one u32.
    let known = unsafe { GetWindowDisplayAffinity(hwnd(id), &mut affinity) }.is_ok();
    if known && affinity != 0 {
        return Err("This app blocks screen capture, so its window cannot be shown.".into());
    }
    Ok(())
}

/// Why a shared window cannot be seen right now, if it cannot.
pub(super) fn visible_problem(id: u32) -> Result<(), String> {
    let handle = hwnd(id);
    // SAFETY: read-only window queries.
    if unsafe { IsIconic(handle) }.as_bool() {
        return Err("The window is minimized. Restore it on your PC to preview it.".into());
    }
    if cloaked(handle) & CLOAKED_SHELL != 0 {
        return Err("Switch to the desktop that contains this window on your PC.".into());
    }
    Ok(())
}
