//! Playing a short sound file on Windows and Linux, where there is no `afplay`.
//! Spoken replies and the F8 microphone cues both go through here; macOS keeps
//! its own `afplay` path in `speech.rs` and `voice_cue.rs`.
use std::path::Path;
use std::process::{Child, Command, Stdio};

/// Plays a WAV file with the .NET `SoundPlayer` every Windows install has. The
/// path travels in an environment variable, never inside the script text.
#[cfg(target_os = "windows")]
pub(super) fn spawn(file: &Path) -> Result<Child, String> {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let mut command = Command::new("powershell.exe");
    command
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            "(New-Object System.Media.SoundPlayer $env:VIBYRA_AUDIO_FILE).PlaySync()",
        ])
        .env("VIBYRA_AUDIO_FILE", file)
        .creation_flags(CREATE_NO_WINDOW);
    quiet(command)
}

/// PulseAudio's `paplay` first, then `ffplay` and ALSA's `aplay`.
#[cfg(all(unix, not(target_os = "macos")))]
pub(super) fn spawn(file: &Path) -> Result<Child, String> {
    let player = ["paplay", "ffplay", "aplay"]
        .into_iter()
        .find(|name| vibyra_core::agents::program_in_path(name))
        .ok_or("No audio player is available. Install pulseaudio-utils or ffmpeg.")?;
    let mut command = Command::new(player);
    if player == "ffplay" {
        command.args(["-nodisp", "-autoexit", "-loglevel", "quiet"]);
    }
    vibyra_core::launch_env::sanitize_command(&mut command);
    command.arg(file);
    quiet(command)
}

#[cfg(any(target_os = "windows", all(unix, not(target_os = "macos"))))]
fn quiet(mut command: Command) -> Result<Child, String> {
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("Could not play the sound: {error}"))
}

/// The operating system's own start and stop sounds for the microphone, if this
/// computer has them. `start` and `stop` only; anything else has no sound.
#[cfg(target_os = "windows")]
pub(super) fn cue_file(kind: &str) -> Option<std::path::PathBuf> {
    let name = match kind {
        "start" => "Speech On.wav",
        "stop" => "Speech Off.wav",
        _ => return None,
    };
    let root = std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into());
    Some(Path::new(&root).join("Media").join(name)).filter(|path| path.is_file())
}

/// The freedesktop sound theme most Linux desktops install.
#[cfg(all(unix, not(target_os = "macos")))]
pub(super) fn cue_file(kind: &str) -> Option<std::path::PathBuf> {
    let name = match kind {
        "start" => "device-added.oga",
        "stop" => "device-removed.oga",
        _ => return None,
    };
    Some(Path::new("/usr/share/sounds/freedesktop/stereo").join(name)).filter(|path| path.is_file())
}

#[cfg(all(test, any(target_os = "windows", all(unix, not(target_os = "macos")))))]
mod tests {
    #[test]
    fn only_start_and_stop_have_cue_sounds() {
        assert!(super::cue_file("record").is_none());
        assert!(super::cue_file("").is_none());
    }
}
