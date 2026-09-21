//! Local, explicitly requested reply playback. Never starts from incoming text.
use parking_lot::Mutex;
use std::process::Child;
use std::sync::LazyLock;

static PLAYBACK: LazyLock<Mutex<Option<(String, Child)>>> = LazyLock::new(|| Mutex::new(None));

pub fn shutdown() {
    if let Some((_, mut child)) = PLAYBACK.lock().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
pub async fn speech_start(id: String, text: String) -> Result<(), String> {
    if text.trim().is_empty() || text.len() > 64 * 1024 {
        return Err("Choose a non-empty reply shorter than 64 KiB to read aloud.".into());
    }
    super::run_blocking(move || start(id, text)).await
}

#[cfg(target_os = "macos")]
fn start(id: String, text: String) -> Result<(), String> {
    use std::io::Write;
    use std::process::{Command, Stdio};
    let mut playback = PLAYBACK.lock();
    if let Some((_, mut child)) = playback.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let mut child = Command::new("/usr/bin/say")
        .args(["-f", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("Could not start spoken reply: {e}"))?;
    let mut input = child.stdin.take().ok_or("Speech input is unavailable")?;
    // Piped text cannot become command-line flags, even when it starts with '-'.
    std::thread::spawn(move || {
        let _ = input.write_all(text.as_bytes());
    });
    *playback = Some((id, child));
    Ok(())
}
#[cfg(not(target_os = "macos"))]
fn start(_id: String, _text: String) -> Result<(), String> {
    Err("Local spoken replies are currently available on Mac.".into())
}

#[tauri::command]
pub async fn speech_stop(id: String) -> Result<(), String> {
    super::run_blocking(move || {
        let mut playback = PLAYBACK.lock();
        if playback.as_ref().is_some_and(|(owner, _)| owner == &id) {
            if let Some((_, mut child)) = playback.take() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn speech_active(id: String) -> Result<bool, String> {
    super::run_blocking(move || {
        let mut playback = PLAYBACK.lock();
        let Some((owner, child)) = playback.as_mut() else { return Ok(false); };
        if owner != &id { return Ok(false); }
        match child.try_wait().map_err(|e| e.to_string())? {
            None => Ok(true),
            Some(status) => { playback.take(); if status.success() { Ok(false) } else { Err("Spoken reply could not finish. Check the Mac's speech voice and audio output.".into()) } }
        }
    }).await
}

#[cfg(test)]
#[path = "speech_tests.rs"]
mod tests;
