//! Who owns a window: its process's creation time and name, and whether it
//! runs with more privilege than Vibyra.

use windows::Win32::Foundation::{CloseHandle, FILETIME, HANDLE};
use windows::Win32::Security::{
    GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, TokenIntegrityLevel,
    TOKEN_MANDATORY_LABEL, TOKEN_QUERY,
};
use windows::Win32::System::Threading::{
    GetCurrentProcess, GetProcessTimes, OpenProcess, OpenProcessToken, QueryFullProcessImageNameW,
    PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};

/// Creation time (100 ns since 1601) and executable name.
pub(super) fn process(pid: u32) -> Option<(u64, String)> {
    // SAFETY: the handle is closed on every path after it opens.
    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
        let (mut created, mut exited, mut kernel, mut user) = Default::default();
        let times = GetProcessTimes(handle, &mut created, &mut exited, &mut kernel, &mut user);
        let mut path = [0u16; 1024];
        let mut length = path.len() as u32;
        let named = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            windows::core::PWSTR(path.as_mut_ptr()),
            &mut length,
        );
        let _ = CloseHandle(handle);
        times.ok()?;
        let created: FILETIME = created;
        let start = (u64::from(created.dwHighDateTime) << 32) | u64::from(created.dwLowDateTime);
        let path = if named.is_ok() {
            String::from_utf16_lossy(&path[..length as usize])
        } else {
            String::new()
        };
        let name = std::path::Path::new(&path).file_stem().map_or_else(
            || format!("Process {pid}"),
            |stem| stem.to_string_lossy().into_owned(),
        );
        Some((start, name))
    }
}

/// Windows silently drops input to a higher-integrity (elevated) window, so
/// say so instead. Unknown counts as elevated.
pub(super) fn more_trusted(pid: u32) -> bool {
    // SAFETY: the process handle is closed before returning.
    let theirs = unsafe {
        match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(process) => {
                let level = integrity(process);
                let _ = CloseHandle(process);
                level
            }
            Err(_) => None,
        }
    };
    // SAFETY: the current-process pseudo handle needs no closing.
    let ours = integrity(unsafe { GetCurrentProcess() });
    match (theirs, ours) {
        (Some(theirs), Some(ours)) => theirs > ours,
        _ => true,
    }
}

fn integrity(process: HANDLE) -> Option<u32> {
    // SAFETY: the token handle is closed; the buffer holds the whole label.
    unsafe {
        let mut token = HANDLE::default();
        OpenProcessToken(process, TOKEN_QUERY, &mut token).ok()?;
        let mut buffer = [0u8; 128];
        let mut length = 0u32;
        let read = GetTokenInformation(
            token,
            TokenIntegrityLevel,
            Some(buffer.as_mut_ptr().cast()),
            buffer.len() as u32,
            &mut length,
        );
        let _ = CloseHandle(token);
        read.ok()?;
        let label = &*(buffer.as_ptr() as *const TOKEN_MANDATORY_LABEL);
        let count = *GetSidSubAuthorityCount(label.Label.Sid);
        Some(*GetSidSubAuthority(
            label.Label.Sid,
            u32::from(count.checked_sub(1)?),
        ))
    }
}
