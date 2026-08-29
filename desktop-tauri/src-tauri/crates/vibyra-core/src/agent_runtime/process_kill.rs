//! Starting a child that can be stopped, and stopping it.
//!
//! Split out because this is the only genuinely platform-specific part of
//! running a turn, and because it is the part that decides whether cancelling
//! leaves a compiler running. On Unix the child becomes a session leader so
//! the whole tree can be signalled at once; Windows has no equivalent, so
//! `taskkill /T` walks the tree instead.
//!
//! Every platform-only import in this file is written inside the function that
//! needs it rather than at the top. A `use` at module scope that only one
//! branch uses is an unused import on the *other* platform — and clippy, run
//! on Linux, reports it as dead while the Windows build breaks on its absence.
//! That is a failure only CI can see, so it is designed out here.

use std::process::Command;

/// Puts the child in its own session so its descendants can be signalled with
/// it. Without this, killing Codex leaves the shell it spawned running.
#[cfg(unix)]
pub(super) fn detach(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    // SAFETY: `setsid` is async-signal-safe and is the documented way to
    // start a new session between fork and exec. Nothing else runs here.
    unsafe {
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
}

#[cfg(not(unix))]
pub(super) fn detach(command: &mut Command) {
    let _ = command;
}

/// Signals the whole group, politely then not.
///
/// The grace period is short because the caller is a user who pressed Stop.
#[cfg(unix)]
pub(super) fn terminate_group(pid: u32) {
    let group = -(pid as i32);
    // SAFETY: `kill` on a pid we spawned; an already-exited group is ESRCH,
    // which is ignored.
    unsafe {
        libc::kill(group, libc::SIGTERM);
    }
    std::thread::sleep(std::time::Duration::from_millis(300));
    unsafe {
        libc::kill(group, libc::SIGKILL);
    }
}

/// Windows has no process groups in this sense. `taskkill /T` walks the tree,
/// which is the closest equivalent and better than killing the child alone.
#[cfg(not(unix))]
pub(super) fn terminate_group(pid: u32) {
    use std::process::Stdio;

    let _ = Command::new("taskkill")
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}
