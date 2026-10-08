use std::process::{Child, Command, Stdio};
use std::sync::mpsc;
use std::time::{Duration, Instant};

/// stdout of a finished, successful command, or `None` on failure, a bad exit
/// or the deadline passing. The command runs in a process group of its own and
/// the whole group is killed rather than left behind: npm's `railway` is a Node
/// wrapper whose real binary used to outlive a kill of the wrapper alone. The
/// read shares the deadline too, since whatever the command left running can
/// hold its stdout open after it exits.
pub(crate) fn run(command: &mut Command, timeout: Duration) -> Option<String> {
    #[cfg(target_os = "macos")]
    std::os::unix::process::CommandExt::process_group(command, 0);
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let (sender, output) = mpsc::channel();
    std::thread::spawn(move || {
        let mut buffer = String::new();
        use std::io::Read;
        let result = stdout.by_ref().take(262145).read_to_string(&mut buffer);
        let _ = sender.send((result.is_ok() && buffer.len() <= 262144).then_some(buffer));
    });
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let left = timeout.saturating_sub(started.elapsed());
                let text = match output.recv_timeout(left.max(Duration::from_millis(200))) {
                    Ok(text) => text,
                    Err(_) => {
                        kill_group(&mut child);
                        None
                    }
                };
                return status.success().then_some(text).flatten();
            }
            Ok(None) if started.elapsed() < timeout => {
                std::thread::sleep(Duration::from_millis(50))
            }
            _ => {
                kill_group(&mut child);
                let _ = child.wait();
                return None;
            }
        }
    }
}

fn kill_group(child: &mut Child) {
    #[cfg(target_os = "macos")]
    // SAFETY: signals only the group `run` created for this child, whose id is
    // the child's pid; the group outlives the child while a member still runs.
    unsafe {
        libc::kill(-(child.id() as libc::pid_t), libc::SIGKILL);
    }
    let _ = child.kill();
}
