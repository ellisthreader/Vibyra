//! Existing ALSA recorder for non-Mac builds.
use std::io::Read;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};

use super::CapturedAudio;

pub fn available() -> bool {
    vibyra_core::agents::program_in_path("arecord")
}

pub struct VoiceRecording {
    child: Child,
    path: PathBuf,
}
impl VoiceRecording {
    pub fn start() -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!("vibyra-voice-{}.raw", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let mut command = Command::new("arecord");
        command
            .args([
                "-q", "-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "raw", "-d", "120",
            ])
            .arg(&path)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null());
        vibyra_core::launch_env::sanitize_command(&mut command);
        let child = command
            .spawn()
            .map_err(|error| format!("Could not start recording: {error}"))?;
        Ok(Self { child, path })
    }
    pub(super) fn finish(mut self) -> Result<CapturedAudio, String> {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let mut raw = Vec::new();
        std::fs::File::open(&self.path)
            .map_err(|error| error.to_string())?
            .take(16_000 * 2 * 120)
            .read_to_end(&mut raw)
            .map_err(|error| error.to_string())?;
        Ok(CapturedAudio {
            raw,
            sample_rate: 16_000,
        })
    }
}
impl Drop for VoiceRecording {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        let _ = std::fs::remove_file(&self.path);
    }
}
