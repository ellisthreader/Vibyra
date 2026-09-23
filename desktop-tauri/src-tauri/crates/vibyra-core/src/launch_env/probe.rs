#![cfg(unix)]

use std::io::{ErrorKind, Read};
use std::os::unix::process::CommandExt;
use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::{Duration, Instant};

use super::{sanitize_command, user_path, END, START};

/// The probe runs once at startup and must never hold the window back. A
/// healthy shell answers in tens of milliseconds; this only bounds a hung one.
const PROBE_TIMEOUT: Duration = Duration::from_secs(5);

/// Asks the user's login shell what PATH it builds.
///
/// `-l` sources the login files (`~/.profile`, `~/.zprofile`) and `-i` sources
/// the interactive ones (`~/.bashrc`, `~/.zshrc`) — the latter is where node
/// tooling almost always adds itself, and the reason a desktop launch cannot
/// see it. Running the real shell rather than guessing also picks up whatever
/// nvm, asdf, mise or pyenv put on PATH, which no static list can.
///
/// Every failure is silent and returns `None`: PATH discovery is an
/// improvement on the inherited value, never a precondition for starting.
pub fn login_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|shell| !shell.is_empty())?;
    // A rc file that starts Vibyra would otherwise probe itself forever.
    if std::env::var_os("VIBYRA_PATH_PROBE").is_some() {
        return None;
    }
    let script = format!("printf '%s%s%s' '{START}' \"$PATH\" '{END}'");
    let mut command = Command::new(&shell);
    command
        .args(["-l", "-i", "-c", &script])
        .env("VIBYRA_PATH_PROBE", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    // The shell's own rc files may run python or perl, which the AppImage
    // environment breaks — probe in a clean one.
    sanitize_command(&mut command);
    // A session of its own: the shell and whatever its rc files start can be
    // killed as one group, and with no controlling terminal an interactive
    // shell spawned from a terminal launch cannot stop itself (SIGTTOU)
    // trying to take that terminal over — a desktop launch never has one.
    // SAFETY: setsid is async-signal-safe and touches no memory.
    unsafe {
        command.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    let mut child = command.spawn().ok()?;
    let stdout = child.stdout.take()?;
    let deadline = Instant::now() + PROBE_TIMEOUT;
    let path = read_path(stdout, deadline);
    reap(&mut child, deadline);
    path
}

/// Reads until the markers arrive rather than to end of file: anything an rc
/// file backgrounds inherits stdout and can hold the pipe open forever.
fn read_path(mut stdout: impl Read + Send + 'static, deadline: Instant) -> Option<String> {
    let (sender, receiver) = mpsc::channel::<Vec<u8>>();
    thread::spawn(move || {
        let mut chunk = [0u8; 4096];
        loop {
            match stdout.read(&mut chunk) {
                Ok(0) => return,
                Ok(read) if sender.send(chunk[..read].to_vec()).is_ok() => {}
                Err(error) if error.kind() == ErrorKind::Interrupted => {}
                _ => return,
            }
        }
    });
    let mut output = Vec::new();
    loop {
        if let Some(path) = user_path::extract(&String::from_utf8_lossy(&output)) {
            return Some(path.to_owned());
        }
        let remaining = deadline.saturating_duration_since(Instant::now());
        output.extend(receiver.recv_timeout(remaining).ok()?);
    }
}

/// Waits for the shell to exit, and past the deadline kills its whole
/// session — the shell and anything it left behind holding the pipe.
fn reap(child: &mut Child, deadline: Instant) {
    while Instant::now() < deadline {
        if !matches!(child.try_wait(), Ok(None)) {
            return;
        }
        thread::sleep(Duration::from_millis(10));
    }
    // SAFETY: kill(2) takes plain integers; the shell is not yet reaped, so
    // its pid (and the group it leads) cannot have been reused.
    unsafe {
        libc::kill(-(child.id() as libc::pid_t), libc::SIGKILL);
    }
    let _ = child.wait();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_pipe_held_open_by_a_background_process_does_not_hold_the_answer() {
        let mut child = Command::new("sh")
            .args(["-c", &format!("sleep 3 & printf '%s' '{START}/bin{END}'")])
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let started = Instant::now();
        let stdout = child.stdout.take().unwrap();
        let path = read_path(stdout, started + Duration::from_secs(5));
        assert_eq!(path.as_deref(), Some("/bin"));
        assert!(started.elapsed() < Duration::from_secs(2));
        let _ = child.wait();
    }
}
