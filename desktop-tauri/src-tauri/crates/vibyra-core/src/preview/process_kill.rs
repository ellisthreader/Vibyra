use std::process::Child;
#[cfg(windows)]
use std::process::{Command, Stdio};
#[cfg(unix)]
use std::thread;
#[cfg(unix)]
use std::time::Duration;

use super::process::ManagedChild;
use super::refresher::{DesktopProbe, TreeProcess};

/// Keeps hold of everything a preview started. Unix children lead their own
/// process group, so the guard itself is empty there. On Windows it owns a job
/// object: every descendant joins it, and closing it — on Stop, or when
/// Vibyra exits for any reason — ends the whole tree.
pub(crate) struct TreeGuard {
    #[cfg(windows)]
    job: Option<isize>,
}

#[cfg(not(windows))]
impl TreeGuard {
    pub(crate) fn adopt(_child: &Child) -> Self {
        Self {}
    }
}

#[cfg(windows)]
impl TreeGuard {
    pub(crate) fn adopt(child: &Child) -> Self {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::Foundation::CloseHandle;
        use windows_sys::Win32::System::JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        };
        // SAFETY: plain Win32 calls on a handle this function owns; the child's
        // handle stays valid while `child` is borrowed.
        unsafe {
            let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if job.is_null() {
                return Self { job: None };
            }
            let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            let configured = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                (&limits as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
                std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) != 0;
            if !configured || AssignProcessToJobObject(job, child.as_raw_handle().cast()) == 0 {
                CloseHandle(job);
                return Self { job: None };
            }
            Self {
                job: Some(job as isize),
            }
        }
    }

    fn terminate(&self) -> bool {
        use windows_sys::Win32::System::JobObjects::TerminateJobObject;
        // SAFETY: the handle is owned by this guard until it drops.
        self.job
            .is_some_and(|job| unsafe { TerminateJobObject(job as _, 1) != 0 })
    }
}

#[cfg(windows)]
impl Drop for TreeGuard {
    fn drop(&mut self) {
        if let Some(job) = self.job.take() {
            // SAFETY: closing the handle this guard owns, once.
            unsafe { windows_sys::Win32::Foundation::CloseHandle(job as _) };
        }
    }
}

pub(crate) fn terminate(child: &mut ManagedChild) {
    if child.child.try_wait().ok().flatten().is_some() {
        return;
    }
    #[cfg(windows)]
    if child.tree.terminate() {
        let _ = child.child.wait();
        return;
    }
    terminate_group(&mut child.child);
}

/// Ends a process that left the preview's group, only after its start time
/// proves it is the one the preview started and not a reused pid.
pub(crate) fn kill_pid_verified(probe: &dyn DesktopProbe, process: &TreeProcess) {
    if probe.still_running(process) {
        kill_pid(process.pid);
    }
}

fn kill_pid(pid: u32) {
    #[cfg(unix)]
    {
        // SAFETY: kill(2) takes plain integers and touches no memory.
        unsafe {
            libc::kill(pid as libc::pid_t, libc::SIGKILL);
        }
    }
    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    #[cfg(not(any(unix, windows)))]
    let _ = pid;
}

#[cfg(unix)]
fn terminate_group(child: &mut Child) {
    let pid = child.id() as i32;
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
    }
    for _ in 0..10 {
        if child.try_wait().ok().flatten().is_some() {
            return;
        }
        thread::sleep(Duration::from_millis(50));
    }
    unsafe {
        libc::kill(-pid, libc::SIGKILL);
    }
    let _ = child.wait();
}

#[cfg(windows)]
fn terminate_group(child: &mut Child) {
    let pid = child.id().to_string();
    let _ = Command::new("taskkill")
        .args(["/PID", &pid, "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let _ = child.wait();
}

#[cfg(not(any(unix, windows)))]
fn terminate_group(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}
