//! The Agent browser's control channel: Chrome's `--remote-debugging-pipe`.
//! Chrome reads NUL-terminated CDP messages from its descriptor 3 and writes
//! its replies to descriptor 4, so no TCP port (and nothing another local
//! process could connect to) ever exists for the DevTools protocol.

use std::io::{PipeReader, PipeWriter};
use std::process::{Child, Command};

/// Starts `command` with the two pipe descriptors Chrome expects and returns
/// our ends: what Chrome writes (its fd 4) and what we write (its fd 3).
#[cfg(unix)]
pub fn spawn(command: &mut Command) -> std::io::Result<(Child, PipeReader, PipeWriter)> {
    use std::os::fd::AsRawFd;
    use std::os::unix::process::CommandExt;
    let (chrome_in, to_chrome) = std::io::pipe()?;
    let (from_chrome, chrome_out) = std::io::pipe()?;
    let (read_fd, write_fd) = (chrome_in.as_raw_fd(), chrome_out.as_raw_fd());
    // SAFETY: the closure only calls async-signal-safe libc functions between
    // fork and exec. Both descriptors are first copied above 4 (close-on-exec)
    // so that neither mapping can overwrite the other's source.
    unsafe {
        command.pre_exec(move || {
            let read = libc::fcntl(read_fd, libc::F_DUPFD_CLOEXEC, 10);
            let write = libc::fcntl(write_fd, libc::F_DUPFD_CLOEXEC, 10);
            if read < 0 || write < 0 || libc::dup2(read, 3) < 0 || libc::dup2(write, 4) < 0 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let child = command.spawn()?;
    // Chrome owns these ends now; holding them would keep the pipes open forever.
    drop(chrome_in);
    drop(chrome_out);
    Ok((child, from_chrome, to_chrome))
}

/// Windows has no descriptors 3 and 4 to hand over: Chrome takes the two
/// inherited pipe handles as `--remote-debugging-io-pipes=<read>,<write>`.
/// Only those two handles are inheritable; our ends never are.
#[cfg(windows)]
pub fn spawn(command: &mut Command) -> std::io::Result<(Child, PipeReader, PipeWriter)> {
    use std::os::windows::io::{FromRawHandle, OwnedHandle, RawHandle};
    use windows::Win32::Foundation::{
        SetHandleInformation, HANDLE, HANDLE_FLAGS, HANDLE_FLAG_INHERIT,
    };
    use windows::Win32::Security::SECURITY_ATTRIBUTES;
    use windows::Win32::System::Pipes::CreatePipe;
    let inheritable = SECURITY_ATTRIBUTES {
        nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
        lpSecurityDescriptor: std::ptr::null_mut(),
        bInheritHandle: true.into(),
    };
    let pipe = || -> std::io::Result<(OwnedHandle, OwnedHandle)> {
        let (mut read, mut write) = (HANDLE::default(), HANDLE::default());
        // SAFETY: both out-pointers are valid; on success we own both handles.
        unsafe { CreatePipe(&mut read, &mut write, Some(&inheritable), 0) }
            .map_err(|error| std::io::Error::other(error.to_string()))?;
        // SAFETY: freshly created handles that nothing else owns.
        Ok(unsafe {
            (
                OwnedHandle::from_raw_handle(read.0 as RawHandle),
                OwnedHandle::from_raw_handle(write.0 as RawHandle),
            )
        })
    };
    let (chrome_in, to_chrome) = pipe()?;
    let (from_chrome, chrome_out) = pipe()?;
    for ours in [&to_chrome, &from_chrome] {
        use std::os::windows::io::AsRawHandle;
        let handle = HANDLE(ours.as_raw_handle() as _);
        // SAFETY: a valid handle we own; only its inherit flag changes.
        unsafe { SetHandleInformation(handle, HANDLE_FLAG_INHERIT.0, HANDLE_FLAGS(0)) }
            .map_err(|error| std::io::Error::other(error.to_string()))?;
    }
    {
        use std::os::windows::io::AsRawHandle;
        command.arg(format!(
            "--remote-debugging-io-pipes={},{}",
            chrome_in.as_raw_handle() as usize,
            chrome_out.as_raw_handle() as usize
        ));
    }
    let child = command.spawn()?;
    // Chrome owns its copies now; holding ours would keep the pipes open forever.
    drop(chrome_in);
    drop(chrome_out);
    Ok((
        child,
        PipeReader::from(from_chrome),
        PipeWriter::from(to_chrome),
    ))
}

#[cfg(not(any(unix, windows)))]
pub fn spawn(_: &mut Command) -> std::io::Result<(Child, PipeReader, PipeWriter)> {
    Err(std::io::ErrorKind::Unsupported.into())
}
