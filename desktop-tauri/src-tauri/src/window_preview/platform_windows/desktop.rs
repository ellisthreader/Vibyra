//! Whether the PC is locked, or a secure desktop (sign-in, UAC) has input.
use windows::Win32::System::RemoteDesktop::{
    WTSFreeMemory, WTSQuerySessionInformationW, WTSSessionInfoEx, WTSINFOEXW,
    WTS_CURRENT_SERVER_HANDLE, WTS_CURRENT_SESSION, WTS_SESSIONSTATE_LOCK,
};
use windows::Win32::System::StationsAndDesktops::{
    CloseDesktop, GetUserObjectInformationW, OpenInputDesktop, DESKTOP_CONTROL_FLAGS,
    DESKTOP_READOBJECTS, UOI_NAME,
};

pub(super) fn unlocked() -> Result<(), String> {
    let mut buffer = windows::core::PWSTR::null();
    let mut bytes = 0u32;
    // SAFETY: the buffer WTS allocates is read only while held, then freed.
    let locked = unsafe {
        let queried = WTSQuerySessionInformationW(
            Some(WTS_CURRENT_SERVER_HANDLE),
            WTS_CURRENT_SESSION,
            WTSSessionInfoEx,
            &mut buffer,
            &mut bytes,
        );
        let locked = queried.is_ok() && bytes as usize >= std::mem::size_of::<WTSINFOEXW>() && {
            let info = &*(buffer.0 as *const WTSINFOEXW);
            info.Level == 1
                && info.Data.WTSInfoExLevel1.SessionFlags == WTS_SESSIONSTATE_LOCK as i32
        };
        if !buffer.is_null() {
            WTSFreeMemory(buffer.0.cast());
        }
        locked
    };
    if locked {
        Err("Unlock your PC to preview its windows.".into())
    } else {
        Ok(())
    }
}

/// Input goes only to the normal desktop, never to a sign-in or UAC prompt.
pub(super) fn input_desktop_is_default() -> bool {
    // SAFETY: the desktop handle is closed before returning.
    unsafe {
        let Ok(desktop) = OpenInputDesktop(DESKTOP_CONTROL_FLAGS(0), false, DESKTOP_READOBJECTS)
        else {
            return false;
        };
        let mut name = [0u16; 64];
        let mut needed = 0u32;
        let read = GetUserObjectInformationW(
            windows::Win32::Foundation::HANDLE(desktop.0),
            UOI_NAME,
            Some(name.as_mut_ptr().cast()),
            (name.len() * 2) as u32,
            Some(&mut needed),
        );
        let _ = CloseDesktop(desktop);
        let end = name.iter().position(|c| *c == 0).unwrap_or(name.len());
        read.is_ok() && String::from_utf16_lossy(&name[..end]).eq_ignore_ascii_case("Default")
    }
}

/// A tap from the phone is meant for the shared window even while the owner
/// uses another one: bring it forward (joining the foreground thread's input
/// so Windows allows it), then let the usual checks confirm before any input.
pub(super) fn bring_to_front(
    handle: windows::Win32::Foundation::HWND,
    check: &crate::window_preview::InputCheck<'_>,
) -> Result<(), String> {
    use windows::Win32::System::Threading::{AttachThreadInput, GetCurrentThreadId};
    use windows::Win32::UI::WindowsAndMessaging::{
        BringWindowToTop, GetForegroundWindow, GetWindowThreadProcessId, SetForegroundWindow,
    };
    // SAFETY: plain window and thread calls; input is detached again below.
    unsafe {
        let foreground = GetForegroundWindow();
        if foreground == handle {
            return Ok(());
        }
        let theirs = GetWindowThreadProcessId(foreground, None);
        let ours = GetCurrentThreadId();
        check()?;
        let attached =
            theirs != 0 && theirs != ours && AttachThreadInput(ours, theirs, true).as_bool();
        let result: Result<(), String> = (|| {
            check()?;
            let _ = BringWindowToTop(handle);
            check()?;
            let _ = SetForegroundWindow(handle);
            Ok(())
        })();
        if attached {
            let _ = AttachThreadInput(ours, theirs, false);
        }
        result?;
        for _ in 0..10 {
            if GetForegroundWindow() == handle {
                return Ok(());
            }
            std::thread::sleep(std::time::Duration::from_millis(30));
        }
    }
    Ok(())
}
