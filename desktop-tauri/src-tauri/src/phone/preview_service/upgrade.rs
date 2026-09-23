use super::{discovery, upgrade_io, PreviewService, Stream};
use std::io::{Read, Write};
use std::net::Shutdown;
use std::sync::{
    atomic::Ordering,
    mpsc::{self, Receiver, SyncSender},
    Arc,
};
use std::time::Duration;
use vibyra_host::{PreviewFrame as Frame, StreamKey, UpgradeRequest, MAX_CHUNK};

impl PreviewService {
    pub(super) fn begin_upgrade(
        &self,
        device: &str,
        key: StreamKey,
        stream: Arc<Stream>,
        request: UpgradeRequest,
    ) {
        let (write, receive) = mpsc::sync_channel(4);
        *stream.upgrade.lock() = Some(write);
        let service = self.clone();
        let device = device.to_owned();
        std::thread::spawn(move || service.forward_upgrade(device, key, stream, request, receive));
    }

    fn forward_upgrade(
        &self,
        device: String,
        key: StreamKey,
        stream: Arc<Stream>,
        request: UpgradeRequest,
        receiver: Receiver<(Vec<u8>, Frame)>,
    ) {
        let sender = self.inner.subscribers.lock().get(&device).cloned();
        if let Some(sender) = sender {
            if self
                .tunnel_upgrade(&device, key, &stream, &sender, &request, receiver)
                .is_err()
            {
                self.mark_finished(&device, key);
                self.send_cancel(&sender, key);
            }
        }
        stream.canceled.store(true, Ordering::SeqCst);
        stream.wake.notify_all();
        stream.upgrade.lock().take();
        self.inner.streams.lock().remove(&(device, key));
    }

    fn tunnel_upgrade(
        &self,
        device: &str,
        key: StreamKey,
        stream: &Arc<Stream>,
        sender: &SyncSender<Frame>,
        request: &UpgradeRequest,
        receiver: Receiver<(Vec<u8>, Frame)>,
    ) -> Result<(), String> {
        let binding = self.binding(device, key.generation())?;
        if binding
            .automatic
            .as_ref()
            .is_some_and(|server| !discovery::owns(server))
        {
            return Err("The running Preview site changed".into());
        }
        let (mut socket, response) = upgrade_io::connect(&binding, request)?;
        let mut writer = socket.try_clone().map_err(|e| e.to_string())?;
        let writer_sender = sender.clone();
        let writer_stream = stream.clone();
        let service = self.clone();
        let writer_device = device.to_owned();
        std::thread::spawn(move || {
            while !writer_stream.canceled.load(Ordering::SeqCst) {
                let (bytes, credit) = match receiver.recv_timeout(Duration::from_millis(500)) {
                    Ok(item) => item,
                    Err(mpsc::RecvTimeoutError::Timeout) => continue,
                    Err(mpsc::RecvTimeoutError::Disconnected) => break,
                };
                if service.binding(&writer_device, key.generation()).is_err()
                    || writer.write_all(&bytes).is_err()
                    || service
                        .queue_frame(&writer_device, &writer_stream, &writer_sender, key, credit)
                        .is_err()
                {
                    writer_stream.canceled.store(true, Ordering::SeqCst);
                    writer_stream.wake.notify_all();
                    break;
                }
            }
            let _ = writer.shutdown(Shutdown::Write);
        });
        self.queue_frame(device, stream, sender, key, Frame::Open { key })?;
        self.send_bytes(device, stream, sender, key, &response.encode()?)?;
        let mut buffer = [0u8; MAX_CHUNK];
        loop {
            if stream.canceled.load(Ordering::SeqCst) {
                return Err("Preview WebSocket canceled".into());
            }
            self.binding(device, key.generation())?;
            match socket.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => self.send_bytes(device, stream, sender, key, &buffer[..count])?,
                Err(error)
                    if matches!(
                        error.kind(),
                        std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                    ) =>
                {
                    continue
                }
                Err(error) => return Err(error.to_string()),
            }
        }
        self.mark_finished(device, key);
        let end = stream.outbound.lock().end().map_err(str::to_string)?;
        self.queue_frame(device, stream, sender, key, end)
    }
}
