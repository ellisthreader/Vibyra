use super::{Inbound, PreviewService, Stream, MAX_REQUEST_BODY, MAX_STREAMS};
use parking_lot::Mutex;
use std::sync::{atomic::Ordering, mpsc, Arc};
use vibyra_host::{
    PreviewFrame as Frame, PreviewHandler, ReceiveWindow, SendWindow, UpgradeRequest,
};

impl PreviewHandler for PreviewService {
    fn receive(&self, device: &str, frame: Frame) -> Result<(), String> {
        let key = frame.key();
        match frame {
            Frame::Open { .. } => self.receive_open(device, key),
            Frame::Data { .. } => self.receive_data(device, frame),
            Frame::End { .. } => self.receive_end(device, frame),
            Frame::Credit { .. } => {
                if self.finished(device, key) {
                    return Ok(());
                }
                let stream = self.stream(device, key)?;
                if let Err(error) = stream.outbound.lock().apply_credit(&frame) {
                    stream.canceled.store(true, Ordering::SeqCst);
                    stream.upgrade.lock().take();
                    stream.wake.notify_all();
                    self.mark_finished(device, key);
                    self.inner.streams.lock().remove(&(device.into(), key));
                    return Err(error.into());
                }
                stream.wake.notify_all();
                Ok(())
            }
            Frame::Cancel { .. } => {
                if let Some(stream) = self.inner.streams.lock().remove(&(device.into(), key)) {
                    stream.canceled.store(true, Ordering::SeqCst);
                    stream.outbound.lock().revoke();
                    stream.upgrade.lock().take();
                    stream.wake.notify_all();
                }
                Ok(())
            }
        }
    }

    fn subscribe(&self, device: &str) -> mpsc::Receiver<Frame> {
        // A new authenticated session replaces every stream from the old one.
        self.disconnected(device);
        let (sender, receiver) = mpsc::sync_channel(32);
        self.inner.subscribers.lock().insert(device.into(), sender);
        receiver
    }

    fn disconnected(&self, device: &str) {
        self.inner
            .automatic
            .lock()
            .retain(|(owner, _), _| owner != device);
        self.inner
            .bindings
            .lock()
            .retain(|(owner, _), _| owner != device);
        self.inner.subscribers.lock().remove(device);
        self.inner
            .finished
            .lock()
            .retain(|(owner, _)| owner != device);
        self.inner.streams.lock().retain(|(owner, _), stream| {
            if owner != device {
                return true;
            }
            stream.canceled.store(true, Ordering::SeqCst);
            stream.outbound.lock().revoke();
            stream.upgrade.lock().take();
            stream.wake.notify_all();
            false
        });
    }
}

impl PreviewService {
    fn receive_open(&self, device: &str, key: vibyra_host::StreamKey) -> Result<(), String> {
        self.binding(device, key.generation())?;
        if self.finished(device, key) {
            return Err("Preview stream already finished".into());
        }
        let mut streams = self.inner.streams.lock();
        if streams.len() >= MAX_STREAMS || streams.contains_key(&(device.into(), key)) {
            return Err("Too many active Preview requests".into());
        }
        let window = ReceiveWindow::new(key);
        let credit = window.initial_credit();
        streams.insert(
            (device.into(), key),
            Arc::new(Stream {
                inbound: Mutex::new(Inbound {
                    window,
                    chunks: 0,
                    metadata: None,
                    upgraded: false,
                    body: Vec::new(),
                }),
                outbound: Mutex::new(SendWindow::new(key)),
                wake: parking_lot::Condvar::new(),
                canceled: std::sync::atomic::AtomicBool::new(false),
                upgrade: Mutex::new(None),
            }),
        );
        drop(streams);
        self.try_send(device, credit)
    }

    fn receive_data(&self, device: &str, frame: Frame) -> Result<(), String> {
        let key = frame.key();
        let stream = self.stream(device, key)?;
        let mut inbound = stream.inbound.lock();
        inbound.window.accept(frame).map_err(str::to_string)?;
        while let Some((bytes, credit)) = inbound.window.pop() {
            if inbound.chunks == 0 {
                let kind: serde_json::Value = serde_json::from_slice(&bytes)
                    .map_err(|_| "Invalid Preview request metadata")?;
                if kind["kind"] == "upgrade" {
                    let request = UpgradeRequest::decode(&bytes)?;
                    inbound.upgraded = true;
                    self.begin_upgrade(device, key, stream.clone(), request);
                } else {
                    let meta: super::RequestMetadata = serde_json::from_slice(&bytes)
                        .map_err(|_| "Invalid Preview request metadata")?;
                    if meta.v != 1 || meta.kind != "http" {
                        return Err("Unsupported Preview request kind".into());
                    }
                    inbound.metadata = Some(meta);
                }
                self.try_send(device, credit)?;
            } else if inbound.upgraded {
                stream
                    .upgrade
                    .lock()
                    .as_ref()
                    .ok_or("Preview WebSocket ended")?
                    .try_send((bytes, credit))
                    .map_err(|_| "Preview WebSocket input is full")?;
            } else {
                if inbound.body.len().saturating_add(bytes.len()) > MAX_REQUEST_BODY {
                    return Err("Preview upload exceeds proof limit".into());
                }
                inbound.body.extend_from_slice(&bytes);
                self.try_send(device, credit)?;
            }
            inbound.chunks += 1;
        }
        Ok(())
    }

    fn receive_end(&self, device: &str, frame: Frame) -> Result<(), String> {
        let key = frame.key();
        let stream = self.stream(device, key)?;
        let mut inbound = stream.inbound.lock();
        inbound.window.accept(frame).map_err(str::to_string)?;
        if inbound.upgraded {
            stream.upgrade.lock().take();
            return Ok(());
        }
        let metadata = inbound
            .metadata
            .take()
            .ok_or("Missing Preview request metadata")?;
        let body = std::mem::take(&mut inbound.body);
        drop(inbound);
        let service = self.clone();
        let device = device.to_owned();
        std::thread::spawn(move || service.forward_http(device, key, stream, metadata, body));
        Ok(())
    }

    fn stream(&self, device: &str, key: vibyra_host::StreamKey) -> Result<Arc<Stream>, String> {
        self.inner
            .streams
            .lock()
            .get(&(device.into(), key))
            .cloned()
            .ok_or("Preview request is no longer active".into())
    }

    fn try_send(&self, device: &str, frame: Frame) -> Result<(), String> {
        self.inner
            .subscribers
            .lock()
            .get(device)
            .ok_or("Preview phone disconnected")?
            .try_send(frame)
            .map_err(|_| "Preview output is full".into())
    }
}
