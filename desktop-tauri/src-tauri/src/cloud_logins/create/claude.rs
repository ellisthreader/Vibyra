use super::super::token::find_token;
use super::{stopped, Program, Scratch, SIGN_IN_LIMIT, STRIPPED};
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::{
    io::Read,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use vibyra_sync::logins::{pack_entry, CLAUDE_ENTRY};
pub(super) fn create(
    program: &Program,
    interrupted: &(dyn Fn() -> bool + Sync),
) -> Result<Vec<u8>, String> {
    let scratch = Scratch::new()?;
    let pty = native_pty_system()
        .openpty(PtySize {
            rows: 40,
            cols: 400,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|_| "Claude could not start its sign-in.".to_string())?;
    let mut command = CommandBuilder::new(&program.executable);
    for argument in &program.arguments {
        command.arg(argument);
    }
    command.arg("setup-token");
    command.cwd(scratch.0.path());
    for key in STRIPPED {
        command.env_remove(key);
    }
    command.env("CLAUDE_CONFIG_DIR", scratch.0.path());
    command.env("TERM", "xterm-256color");
    let mut child = pty
        .slave
        .spawn_command(command)
        .map_err(|_| "Claude could not start its sign-in.".to_string())?;
    drop(pty.slave);
    let mut reader = pty
        .master
        .try_clone_reader()
        .map_err(|_| "Claude could not start its sign-in.".to_string())?;
    let seen = Arc::new(Mutex::new(Vec::<u8>::new()));
    let sink = Arc::clone(&seen);
    std::thread::spawn(move || {
        let mut chunk = [0u8; 4096];
        while let Ok(n) = reader.read(&mut chunk) {
            if n == 0 {
                break;
            }
            let mut all = sink.lock().unwrap_or_else(|e| e.into_inner());
            if all.len() < 1024 * 1024 {
                all.extend_from_slice(&chunk[..n]);
            }
        }
    });
    let started = Instant::now();
    let finish = |child: &mut Box<dyn portable_pty::Child + Send + Sync>| {
        let _ = child.kill();
        let _ = child.wait();
    };
    loop {
        if let Some(token) = find_token(&seen.lock().unwrap_or_else(|e| e.into_inner())) {
            finish(&mut child);
            seen.lock().unwrap_or_else(|e| e.into_inner()).clear();
            return pack_entry(CLAUDE_ENTRY, token.as_bytes())
                .map_err(|_| "Vibyra could not prepare the sign-in.".into());
        }
        if let Ok(Some(_)) = child.try_wait() {
            std::thread::sleep(Duration::from_millis(300)); // the last lines may still be in the pipe
            if let Some(token) = find_token(&seen.lock().unwrap_or_else(|e| e.into_inner())) {
                return pack_entry(CLAUDE_ENTRY, token.as_bytes())
                    .map_err(|_| "Vibyra could not prepare the sign-in.".into());
            }
            return Err("Claude didn't finish signing in. Try again.".into());
        }
        if interrupted() || started.elapsed() >= SIGN_IN_LIMIT {
            finish(&mut child);
            return Err(stopped(interrupted, "Claude"));
        }
        std::thread::sleep(Duration::from_millis(250));
    }
}
