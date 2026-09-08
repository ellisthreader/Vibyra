use std::fs::File;
use std::io::Read;
use std::path::PathBuf;
use std::process::Child;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub const SAMPLE_RATE: u32 = 16_000;
pub const BYTES_PER_SECOND: usize = SAMPLE_RATE as usize * 2;
pub const MAX_RECORDING_SECONDS: usize = 120;
pub const MAX_RECORDING_BYTES: usize = BYTES_PER_SECOND * MAX_RECORDING_SECONDS;

pub struct VoiceRecording {
    pub child: Child,
    pub path: PathBuf,
    pub metering: Arc<AtomicBool>,
}

impl VoiceRecording {
    pub fn stop(&mut self) {
        self.metering.store(false, Ordering::Relaxed);
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    pub fn read_bounded(&self) -> std::io::Result<Vec<u8>> {
        let mut raw = Vec::new();
        File::open(&self.path)?
            .take(MAX_RECORDING_BYTES as u64)
            .read_to_end(&mut raw)?;
        // A final partial 16-bit sample is not valid PCM.
        raw.truncate(raw.len() / 2 * 2);
        Ok(raw)
    }
}

impl Drop for VoiceRecording {
    fn drop(&mut self) {
        self.stop();
        let _ = std::fs::remove_file(&self.path);
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    #[test]
    fn bounded_read_and_drop_clean_up_owned_capture() {
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "vibyra-capture-test-{}-{unique}.raw",
            std::process::id()
        ));
        File::create_new(&path)
            .unwrap()
            .set_len((MAX_RECORDING_BYTES * 10) as u64)
            .unwrap();
        let child = Command::new("sleep")
            .arg("30")
            .stdin(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        let metering = Arc::new(AtomicBool::new(true));
        let mut recording = VoiceRecording {
            child,
            path: path.clone(),
            metering: Arc::clone(&metering),
        };
        assert_eq!(recording.read_bounded().unwrap().len(), MAX_RECORDING_BYTES);
        recording.stop();
        assert!(recording.child.try_wait().unwrap().is_some());
        assert!(!metering.load(Ordering::Relaxed));
        drop(recording);
        assert!(!path.exists(), "capture for child {pid} was not removed");
    }
}
