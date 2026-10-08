use super::{Inbound, PreviewService, Stream, MAX_STREAMS};
use parking_lot::Mutex;
use std::sync::Arc;
use vibyra_host::{ReceiveWindow, SendWindow};

impl PreviewService {
    pub(super) fn receive_open(
        &self,
        device: &str,
        key: vibyra_host::StreamKey,
        access: Option<Arc<dyn vibyra_host::PreviewAccess>>,
    ) -> Result<(), String> {
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
                remote_access: access,
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
}
