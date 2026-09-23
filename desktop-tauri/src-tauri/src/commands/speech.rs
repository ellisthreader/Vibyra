//! Explicitly requested playback uses Vibyra's synthesised voice on every OS.
//! The player receives a private audio-file path, never reply text as arguments.
use parking_lot::Mutex;
use std::path::PathBuf;
use std::process::Child;
use std::sync::LazyLock;
use tauri::State;

use super::speech_synthesis::{resolve_instructions, resolve_rate, resolve_voice, synthesize};
use crate::ai_usage::{speech_cost_usd, AiCall};
use crate::state::AppState;

const MAX_CHARS: usize = 4_000;

struct Playback {
    id: String,
    child: Child,
    file: PathBuf,
}

impl Drop for Playback {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.file);
    }
}

static PLAYBACK: LazyLock<Mutex<Option<Playback>>> = LazyLock::new(|| Mutex::new(None));

pub fn shutdown() {
    PLAYBACK.lock().take();
}

#[tauri::command]
pub async fn speech_start(
    state: State<'_, AppState>,
    id: String,
    text: String,
    voice: Option<String>,
    rate: Option<f32>,
    style: Option<String>,
) -> Result<(), String> {
    let text = text.trim().to_string();
    if text.is_empty() || text.chars().count() > MAX_CHARS {
        return Err(format!(
            "Choose a non-empty reply shorter than {MAX_CHARS} characters to read aloud."
        ));
    }
    let key = state.openai_key().ok_or_else(|| {
        crate::platform_text::for_computer("Spoken replies are not configured on this Mac. Set OPENAI_API_KEY and restart Vibyra.", "Spoken replies are not configured on this computer. Set OPENAI_API_KEY and restart Vibyra.")
            .to_string()
    })?;
    state.usage.budget_available(state.ai_limits())?;
    let characters = text.chars().count() as u64;
    let permit = state.usage.reserve(
        AiCall::Speech,
        state.ai_limits(),
        speech_cost_usd(characters),
    )?;

    let rate = resolve_rate(rate);
    let audio = synthesize(
        &key,
        &text,
        &resolve_voice(voice),
        rate,
        resolve_instructions(style, rate),
    )
    .await?;
    permit.finish_speech(characters);
    super::run_blocking(move || play(id, audio)).await
}

/// Writes the audio beside the app's other private files and plays it. The
/// player is handed a path and nothing else, so no part of a reply can be read
/// as an argument.
fn play(id: String, audio: Vec<u8>) -> Result<(), String> {
    let mut playback = PLAYBACK.lock();
    playback.take();
    let file = std::env::temp_dir().join(format!(
        "vibyra-speech-{}-{}.{}",
        std::process::id(),
        fastrand_suffix(),
        super::speech_synthesis::AUDIO_FORMAT,
    ));
    write_private(&file, &audio).map_err(|error| error.to_string())?;
    let child = audio_player(&file).inspect_err(|_| {
        let _ = std::fs::remove_file(&file);
    })?;
    *playback = Some(Playback { id, child, file });
    Ok(())
}

#[cfg(target_os = "macos")]
fn audio_player(file: &std::path::Path) -> Result<Child, String> {
    use std::process::{Command, Stdio};
    Command::new("/usr/bin/afplay")
        .arg(file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start spoken reply: {error}"))
}

#[cfg(not(target_os = "macos"))]
fn audio_player(file: &std::path::Path) -> Result<Child, String> {
    use std::process::{Command, Stdio};
    let player = ["paplay", "ffplay", "aplay"]
        .into_iter()
        .find(|name| vibyra_core::agents::program_in_path(name))
        .ok_or("No audio player is available. Install pulseaudio-utils or ffmpeg.")?;
    let mut command = Command::new(player);
    if player == "ffplay" {
        command.args(["-nodisp", "-autoexit", "-loglevel", "quiet"]);
    }
    vibyra_core::launch_env::sanitize_command(&mut command);
    command
        .arg(file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not start spoken reply: {error}"))
}

/// Owner-only and never an existing file, but not fsynced: the audio is played
/// within milliseconds and then deleted, so waiting on the disk only delayed it.
fn write_private(file: &std::path::Path, audio: &[u8]) -> std::io::Result<()> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    options.open(file)?.write_all(audio)
}

/// Enough to keep two replies from sharing a filename; not a secret.
fn fastrand_suffix() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|since| since.as_nanos())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn speech_stop(id: String) -> Result<(), String> {
    super::run_blocking(move || {
        let mut playback = PLAYBACK.lock();
        if playback.as_ref().is_some_and(|current| current.id == id) {
            playback.take();
        }
        Ok(())
    })
    .await
}

#[tauri::command]
pub async fn speech_active(id: String) -> Result<bool, String> {
    super::run_blocking(move || {
        let mut playback = PLAYBACK.lock();
        let Some(current) = playback.as_mut() else {
            return Ok(false);
        };
        if current.id != id {
            return Ok(false);
        }
        match current
            .child
            .try_wait()
            .map_err(|error| error.to_string())?
        {
            None => Ok(true),
            Some(status) => {
                playback.take();
                if status.success() {
                    Ok(false)
                } else {
                    Err(crate::platform_text::for_computer(
                        "The spoken reply could not finish. Check the Mac's audio output.",
                        "The spoken reply could not finish. Check the computer's audio output.",
                    )
                    .into())
                }
            }
        }
    })
    .await
}

#[cfg(test)]
#[path = "speech_tests.rs"]
mod tests;
