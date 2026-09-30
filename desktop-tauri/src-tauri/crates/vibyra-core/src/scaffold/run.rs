use std::io::{BufRead, BufReader, Read};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::thread;
use std::time::{Duration, Instant};

use crate::{CoreError, CoreResult};

use super::plan::ScaffoldStep;

/// A scaffolder that has said nothing for this long is waiting for an answer
/// we cannot give it — there is no terminal on the other end of its stdin.
const STALL: Duration = Duration::from_secs(90);
const LINE_CAP: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StepOutcome {
    Finished(i32),
    /// Silent past the stall guard: offer the user a real terminal instead.
    Stalled,
    Cancelled,
}

pub fn run_step(
    step: &ScaffoldStep,
    on_line: &dyn Fn(String),
    cancel: &AtomicBool,
) -> CoreResult<StepOutcome> {
    let mut command = Command::new(resolve_program(&step.program));
    command
        .args(&step.args)
        .current_dir(&step.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    configure_process_group(&mut command);
    // Without this a desktop launch hands the child the AppImage's own loader
    // paths, and `npx` or `python3` fails in ways that read as a broken
    // template rather than a broken environment.
    crate::launch_env::sanitize_command(&mut command);
    let mut child = command
        .spawn()
        .map_err(|error| CoreError::Scaffold(format!("could not run {}: {error}", step.program)))?;

    let (sender, receiver) = channel::<String>();
    if let Some(stdout) = child.stdout.take() {
        pump(stdout, sender.clone());
    }
    if let Some(stderr) = child.stderr.take() {
        pump(stderr, sender.clone());
    }
    drop(sender);

    let mut last = Instant::now();
    loop {
        if cancel.load(Ordering::Relaxed) {
            terminate_group(&mut child);
            return Ok(StepOutcome::Cancelled);
        }
        match receiver.recv_timeout(Duration::from_millis(250)) {
            Ok(line) => {
                last = Instant::now();
                on_line(line);
            }
            Err(RecvTimeoutError::Timeout) => {
                if last.elapsed() > STALL {
                    terminate_group(&mut child);
                    return Ok(StepOutcome::Stalled);
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
    }
    let status = child.wait()?;
    Ok(StepOutcome::Finished(status.code().unwrap_or(-1)))
}

/// `git init`, unless the scaffolder already made a repository.
pub fn git_init(dir: &str) -> bool {
    if Path::new(dir).join(".git").exists() {
        return true;
    }
    let mut command = Command::new("git");
    command
        .args(["init"])
        .current_dir(dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    crate::launch_env::sanitize_command(&mut command);
    command
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn pump(source: impl Read + Send + 'static, sender: Sender<String>) {
    thread::spawn(move || {
        let reader = BufReader::new(source);
        for line in reader.lines() {
            let Ok(line) = line else { return };
            let trimmed: String = line.chars().take(LINE_CAP).collect();
            if sender.send(trimmed).is_err() {
                return;
            }
        }
    });
}

/// Node ships its CLIs as `.cmd` shims on Windows, and `Command` without a
/// shell will not find the extensionless name. The cfg-only import stays
/// inside the function so a Linux build cannot hide a Windows break.
#[cfg(windows)]
fn resolve_program(program: &str) -> String {
    const SHIMMED: [&str; 4] = ["npm", "npx", "yarn", "pnpm"];
    if SHIMMED.contains(&program) {
        format!("{program}.cmd")
    } else {
        program.to_owned()
    }
}

#[cfg(not(windows))]
fn resolve_program(program: &str) -> String {
    program.to_owned()
}

#[cfg(unix)]
fn configure_process_group(command: &mut Command) {
    use std::os::unix::process::CommandExt;
    command.process_group(0);
}

#[cfg(not(unix))]
fn configure_process_group(_command: &mut Command) {}

/// Scaffolders spawn their own children — a package manager is a tree, not a
/// process — so cancelling has to take the whole group with it.
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
