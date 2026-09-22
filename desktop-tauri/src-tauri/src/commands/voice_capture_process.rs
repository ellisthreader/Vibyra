//! ALSA capture stays in memory, like the Mac CoreAudio recorder.
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::sync::{mpsc, Arc};
use std::thread::JoinHandle;
use std::time::Duration;

use parking_lot::Mutex;

use super::CapturedAudio;

const SAMPLE_RATE: u32 = 16_000;
const MAX_BYTES: usize = SAMPLE_RATE as usize * 2 * 120;
const INPUT_ERROR: &str = "Could not read the microphone. Check the default input in Sound settings and install alsa-utils.";

pub fn available() -> bool {
    vibyra_core::agents::program_in_path("arecord")
}

pub struct VoiceRecording {
    child: Child,
    reader: Option<JoinHandle<Result<(), String>>>,
    samples: Arc<Mutex<Vec<u8>>>,
}

impl VoiceRecording {
    pub fn start() -> Result<Self, String> {
        let mut command = Command::new("arecord");
        command.args([
            "-q",
            "-f",
            "S16_LE",
            "-r",
            "16000",
            "-c",
            "1",
            "-t",
            "raw",
            "-d",
            "120",
            "--buffer-time=100000",
            "--period-time=50000",
        ]);
        Self::from_command(command)
    }

    fn from_command(mut command: Command) -> Result<Self, String> {
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null());
        vibyra_core::launch_env::sanitize_command(&mut command);
        let mut child = command
            .spawn()
            .map_err(|error| format!("{INPUT_ERROR} ({error})"))?;
        let stdout = child.stdout.take().ok_or(INPUT_ERROR)?;
        let samples = Arc::new(Mutex::new(Vec::new()));
        let output = Arc::clone(&samples);
        let (ready, started) = mpsc::sync_channel(1);
        let reader = std::thread::spawn(move || read_samples(stdout, output, ready));
        let recording = Self {
            child,
            reader: Some(reader),
            samples,
        };
        // arecord can spawn successfully and then reject the selected device.
        // Do not report recording until PCM actually arrives.
        started
            .recv_timeout(Duration::from_secs(5))
            .map_err(|_| INPUT_ERROR.to_string())??;
        Ok(recording)
    }

    pub(super) fn finish(mut self) -> Result<CapturedAudio, String> {
        let exited = self.child.try_wait().map_err(|error| error.to_string())?;
        let _ = self.child.kill();
        let _ = self.child.wait();
        self.reader
            .take()
            .ok_or("Recording already stopped")?
            .join()
            .map_err(|_| "Microphone capture stopped unexpectedly".to_string())??;
        let mut raw = std::mem::take(&mut *self.samples.lock());
        if exited.is_some_and(|status| !status.success()) && raw.len() < MAX_BYTES {
            return Err(INPUT_ERROR.into());
        }
        raw.truncate(raw.len() & !1);
        Ok(CapturedAudio {
            raw,
            sample_rate: SAMPLE_RATE,
        })
    }
}

fn read_samples(
    mut input: impl Read,
    samples: Arc<Mutex<Vec<u8>>>,
    ready: mpsc::SyncSender<Result<(), String>>,
) -> Result<(), String> {
    let mut ready = Some(ready);
    let mut chunk = [0u8; 4096];
    loop {
        let count = match input.read(&mut chunk) {
            Ok(count) => count,
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(format!("{INPUT_ERROR} ({error})")),
        };
        if count == 0 {
            if let Some(ready) = ready.take() {
                let _ = ready.send(Err(INPUT_ERROR.into()));
            }
            return Ok(());
        }
        let mut raw = samples.lock();
        let remaining = MAX_BYTES.saturating_sub(raw.len());
        raw.extend_from_slice(&chunk[..count.min(remaining)]);
        if let Some(ready) = ready.take() {
            let _ = ready.send(Ok(()));
        }
        if raw.len() == MAX_BYTES {
            return Ok(());
        }
    }
}

impl Drop for VoiceRecording {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
        if let Some(reader) = self.reader.take() {
            let _ = reader.join();
        }
    }
}

#[cfg(test)]
#[path = "voice_capture_process_tests.rs"]
mod tests;
