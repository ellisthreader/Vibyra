#![cfg(unix)]

use std::io::Read;
use std::process::{Command, Stdio};
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
    let mut child = command.spawn().ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = thread::spawn(move || {
        let mut output = String::new();
        let _ = stdout.read_to_string(&mut output);
        output
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if started.elapsed() < PROBE_TIMEOUT => {
                thread::sleep(Duration::from_millis(10));
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    }
    let output = reader.join().ok()?;
    user_path::extract(&output).map(str::to_owned)
}
