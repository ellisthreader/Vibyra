//! Stopping a child together with everything it started.
//!
//! Package managers, dev servers and provider CLIs are trees: `npm` runs a
//! shell that runs node, and `codex` is a node wrapper around the native
//! binary that owns the sign-in callback server. Killing only the direct child
//! orphans the rest, so such children lead their own process group and are
//! stopped by signalling the group.

use std::process::{Child, Command};
use std::time::{Duration, Instant};

const POLL: Duration = Duration::from_millis(20);

/// Makes the spawned child the leader of a new process group, so that
/// [`stop_all`] reaches its descendants too. A no-op off Unix.
pub fn isolate(command: &mut Command) {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    #[cfg(not(unix))]
    let _ = command;
}

/// Asks every child to exit, then waits once for all of them — never once per
/// child — for up to `grace`, kills whatever is still running and reaps it.
/// Children that already exited are only reaped.
pub fn stop_all<'a>(children: impl IntoIterator<Item = &'a mut Child>, grace: Duration) {
    let mut running: Vec<&mut Child> = children
        .into_iter()
        .filter_map(|child| if exited(child) { None } else { Some(child) })
        .collect();
    for child in &mut running {
        signal(child, false);
    }
    let deadline = Instant::now() + grace;
    while !running.is_empty() && Instant::now() < deadline {
        std::thread::sleep(POLL);
        running.retain_mut(|child| !exited(child));
    }
    for child in running {
        signal(child, true);
        let _ = child.wait();
    }
}

/// [`stop_all`] for one child.
pub fn stop(child: &mut Child, grace: Duration) {
    stop_all(std::iter::once(child), grace);
}

/// For a fire-and-forget child such as `open`: nothing wants its exit status,
/// but a dropped `Child` is never waited on and stays a zombie until the app
/// quits. A thread waits for it instead.
pub fn reap_when_done(mut child: Child) {
    let _ = std::thread::Builder::new()
        .name("vibyra-reap".into())
        .spawn(move || {
            let _ = child.wait();
        });
}

fn exited(child: &mut Child) -> bool {
    // An error means the child can no longer be waited on: nothing to stop.
    !matches!(child.try_wait(), Ok(None))
}

/// Signals the child's group, or the child alone when it was not spawned
/// through [`isolate`] and so leads no group. Only called on a child that has
/// not been reaped, so its pid cannot have been reused.
#[cfg(unix)]
fn signal(child: &mut Child, force: bool) {
    let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
    let pid = child.id() as libc::pid_t;
    // SAFETY: kill(2) takes plain integers and touches no memory.
    unsafe {
        if libc::kill(-pid, signal) != 0 {
            libc::kill(pid, signal);
        }
    }
}

#[cfg(windows)]
fn signal(child: &mut Child, _force: bool) {
    use std::process::Stdio;
    // Windows has no polite group signal; `/T` takes the whole tree.
    let _ = Command::new("taskkill")
        .args(["/PID", &child.id().to_string(), "/T", "/F"])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

#[cfg(not(any(unix, windows)))]
fn signal(child: &mut Child, _force: bool) {
    let _ = child.kill();
}

#[cfg(all(test, unix))]
mod tests {
    use std::io::{BufRead, BufReader};
    use std::process::Stdio;

    use super::*;

    fn alive(pid: libc::pid_t) -> bool {
        // SAFETY: signal 0 only checks that the pid exists.
        unsafe { libc::kill(pid, 0) == 0 }
    }

    #[test]
    fn stopping_a_group_takes_its_grandchildren_with_it() {
        let mut command = Command::new("sh");
        command
            .args(["-c", "sleep 30 & echo $!; wait"])
            .stdout(Stdio::piped());
        isolate(&mut command);
        let mut child = command.spawn().unwrap();
        let mut line = String::new();
        BufReader::new(child.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let grandchild: libc::pid_t = line.trim().parse().unwrap();
        stop(&mut child, Duration::from_secs(2));
        let deadline = Instant::now() + Duration::from_secs(3);
        while alive(grandchild) && Instant::now() < deadline {
            std::thread::sleep(POLL);
        }
        assert!(!alive(grandchild), "the grandchild outlived its group");
    }

    #[test]
    fn a_child_that_ignores_the_request_is_killed_after_one_grace() {
        let spawn = || {
            let mut command = Command::new("sh");
            command.args(["-c", "trap '' TERM; sleep 30"]);
            isolate(&mut command);
            command.spawn().unwrap()
        };
        let (mut first, mut second) = (spawn(), spawn());
        std::thread::sleep(Duration::from_millis(100));
        let started = Instant::now();
        stop_all([&mut first, &mut second], Duration::from_millis(300));
        // One shared grace, not one per child.
        assert!(started.elapsed() < Duration::from_millis(1500));
        assert!(first.try_wait().unwrap().is_some());
        assert!(second.try_wait().unwrap().is_some());
    }
}
