use super::{PreviewService, Stream};
use std::sync::{
    atomic::Ordering,
    mpsc::{SyncSender, TrySendError},
};
use std::time::{Duration, Instant};
use vibyra_host::{PreviewFrame as Frame, StreamKey, MAX_CHUNK};

impl PreviewService {
    pub(super) fn send_bytes(
        &self,
        device: &str,
        stream: &Stream,
        sender: &SyncSender<Frame>,
        key: StreamKey,
        bytes: &[u8],
    ) -> Result<(), String> {
        let mut offset = 0;
        let mut deadline = Instant::now() + Duration::from_secs(30);
        while offset < bytes.len() {
            // Revocation, project switches, target edits, and Preview stop take
            // effect even on a response that was already flowing.
            self.binding(device, key.generation())?;
            let mut window = stream.outbound.lock();
            while window.available() == 0 && !stream.canceled.load(Ordering::SeqCst) {
                if Instant::now() >= deadline {
                    return Err("Preview phone stopped reading".into());
                }
                stream
                    .wake
                    .wait_for(&mut window, Duration::from_millis(250));
                drop(window);
                self.binding(device, key.generation())?;
                window = stream.outbound.lock();
            }
            if stream.canceled.load(Ordering::SeqCst) {
                return Err("Preview canceled".into());
            }
            let count = window.available().min(MAX_CHUNK).min(bytes.len() - offset);
            let frame = window
                .data(bytes[offset..offset + count].to_vec())
                .map_err(str::to_string)?;
            drop(window);
            if frame.key() != key {
                return Err("Preview stream changed".into());
            }
            self.queue_frame(device, stream, sender, key, frame)?;
            offset += count;
            deadline = Instant::now() + Duration::from_secs(30);
        }
        Ok(())
    }

    pub(super) fn queue_frame(
        &self,
        device: &str,
        stream: &Stream,
        sender: &SyncSender<Frame>,
        key: StreamKey,
        mut frame: Frame,
    ) -> Result<(), String> {
        let deadline = Instant::now() + Duration::from_secs(30);
        loop {
            if stream.canceled.load(Ordering::SeqCst) {
                return Err("Preview canceled".into());
            }
            self.binding(device, key.generation())?;
            match sender.try_send(frame) {
                Ok(()) => return Ok(()),
                Err(TrySendError::Disconnected(_)) => {
                    return Err("Preview phone disconnected".into())
                }
                Err(TrySendError::Full(pending)) => frame = pending,
            }
            if Instant::now() >= deadline {
                return Err("Preview output stopped draining".into());
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    pub(super) fn send_cancel(&self, sender: &SyncSender<Frame>, key: StreamKey) {
        let deadline = Instant::now() + Duration::from_secs(1);
        let mut frame = Frame::Cancel { key };
        loop {
            match sender.try_send(frame) {
                Ok(()) | Err(TrySendError::Disconnected(_)) => break,
                Err(TrySendError::Full(pending)) => frame = pending,
            }
            if Instant::now() >= deadline {
                break;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
    }
}
