use super::{stopped, Program, Scratch, MAX_LOGIN_BYTES, SIGN_IN_LIMIT, STRIPPED};
use std::{
    process::{Command, Stdio},
    time::{Duration, Instant},
};
use vibyra_sync::logins::pack_codex;
pub(super) fn create(
    program: &Program,
    interrupted: &(dyn Fn() -> bool + Sync),
) -> Result<Vec<u8>, String> {
    let scratch = Scratch::new()?;
    let mut command = Command::new(&program.executable);
    command
        .args(&program.arguments)
        .args(["login", "-c", "cli_auth_credentials_store=\"file\""])
        .env("CODEX_HOME", scratch.0.path())
        .current_dir(scratch.0.path())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    for key in STRIPPED.iter().filter(|key| **key != "CODEX_HOME") {
        command.env_remove(key);
    }
    let mut child = command
        .spawn()
        .map_err(|_| "Codex could not start its sign-in.".to_string())?;
    let started = Instant::now();
    let status = loop {
        if let Ok(Some(status)) = child.try_wait() {
            break status;
        }
        if interrupted() || started.elapsed() >= SIGN_IN_LIMIT {
            let _ = child.kill();
            let _ = child.wait();
            return Err(stopped(interrupted, "Codex"));
        }
        std::thread::sleep(Duration::from_millis(250));
    };
    if !status.success() {
        return Err("Codex didn't finish signing in. Try again.".into());
    }
    let file = scratch.0.path().join("auth.json");
    let meta = std::fs::symlink_metadata(&file)
        .map_err(|_| "Codex didn't save a sign-in. Try again.".to_string())?;
    if !meta.is_file() || meta.len() > MAX_LOGIN_BYTES {
        return Err("Codex saved an unexpected sign-in. Try again.".into());
    }
    let bytes =
        std::fs::read(&file).map_err(|_| "Codex didn't save a sign-in. Try again.".to_string())?;
    if !serde_json::from_slice::<serde_json::Value>(&bytes)
        .map(|v| v.is_object())
        .unwrap_or(false)
    {
        return Err("Codex saved an unexpected sign-in. Try again.".into());
    }
    pack_codex(&bytes).map_err(|_| "Vibyra could not prepare the sign-in.".into())
}
