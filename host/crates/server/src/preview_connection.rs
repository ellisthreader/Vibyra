//! Preview shares the authenticated Noise session, but not the terminal RPC
//! worker or its output queue. Only the backend can authorize local sites.
use crate::{backend::PreviewHandler, state::Shared};
use std::{
    collections::HashSet,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    time::Duration,
};
use tokio::sync::{mpsc as async_mpsc, Notify};
use vibyra_transport::preview::{Frame, FrameQueue, StreamKey};

#[path = "preview_access.rs"]
mod authorization;
#[path = "preview_receive.rs"]
mod receive;

const INBOUND: usize = 32;
const OUTBOUND: usize = 8;

pub struct PreviewSession {
    handler: Option<Arc<dyn PreviewHandler>>,
    device: String,
    owner: Arc<Shared>,
    slot: Arc<Notify>,
    data: Option<async_mpsc::Sender<Frame>>,
    control: Option<async_mpsc::Sender<Frame>>,
    outgoing: async_mpsc::Receiver<Frame>,
    pending: Option<Frame>,
    queue: FrameQueue,
    stop: Arc<AtomicBool>,
    canceled: Arc<Mutex<HashSet<StreamKey>>>,
}
impl PreviewSession {
    pub fn new(
        owner: &Arc<Shared>,
        device: &str,
        slot: &Arc<Notify>,
        access: crate::remote_authorization::Access,
    ) -> Self {
        let handler = crate::remote_permissions::permits(&access, "preview:access")
            .then(|| owner.engine.preview(device))
            .flatten();
        let access = access.map(|grant| {
            Arc::new(authorization::ScopedPreview {
                grant,
                owner: Arc::downgrade(owner),
                device: device.into(),
                slot: Arc::downgrade(slot),
            }) as Arc<dyn crate::backend::PreviewAccess>
        });
        let (out_tx, outgoing) = async_mpsc::channel(OUTBOUND);
        let stop = Arc::new(AtomicBool::new(false));
        let canceled = Arc::new(Mutex::new(HashSet::new()));
        let (data, control) = if let Some(handler) = &handler {
            let (data_tx, mut data_rx) = async_mpsc::channel::<Frame>(INBOUND);
            let (control_tx, mut control_rx) = async_mpsc::channel::<Frame>(INBOUND);
            let worker = handler.clone();
            let worker_device = device.to_owned();
            let worker_out = out_tx.clone();
            let worker_stop = stop.clone();
            let worker_canceled = canceled.clone();
            tokio::spawn(async move {
                loop {
                    let frame = tokio::select! { biased;
                        frame = control_rx.recv() => frame,
                        frame = data_rx.recv() => frame,
                    };
                    let Some(frame) = frame else {
                        break;
                    };
                    if worker_stop.load(Ordering::SeqCst) {
                        break;
                    }
                    let key = frame.key();
                    if !matches!(frame, Frame::Cancel { .. })
                        && worker_canceled.lock().is_ok_and(|keys| keys.contains(&key))
                    {
                        continue;
                    }
                    let handler = worker.clone();
                    let device = worker_device.clone();
                    let access = access.clone();
                    let result = tokio::task::spawn_blocking(move || {
                        handler.receive_authorized(&device, frame, access)
                    })
                    .await;
                    if !matches!(result, Ok(Ok(()))) {
                        if let Ok(mut keys) = worker_canceled.lock() {
                            keys.insert(key);
                        }
                        if worker_out.send(Frame::Cancel { key }).await.is_err() {
                            break;
                        }
                    }
                }
            });
            let source = handler.subscribe(device);
            let source_stop = stop.clone();
            std::thread::spawn(move || {
                while !source_stop.load(Ordering::SeqCst) {
                    match source.recv_timeout(Duration::from_millis(100)) {
                        Ok(frame) => {
                            if out_tx.blocking_send(frame).is_err() {
                                break;
                            }
                        }
                        Err(mpsc::RecvTimeoutError::Timeout) => {}
                        Err(mpsc::RecvTimeoutError::Disconnected) => break,
                    }
                }
            });
            (Some(data_tx), Some(control_tx))
        } else {
            (None, None)
        };
        Self {
            handler,
            device: device.into(),
            owner: owner.clone(),
            slot: slot.clone(),
            data,
            control,
            outgoing,
            pending: None,
            queue: FrameQueue::new(),
            stop,
            canceled,
        }
    }

    pub fn collectable(&self) -> bool {
        self.handler.is_some() && self.pending.is_none()
    }
    pub async fn next_outgoing(&mut self) -> Option<Frame> {
        self.outgoing.recv().await
    }
    pub fn source_ended(&mut self) {
        self.disable();
    }
    pub fn enqueue(&mut self, frame: Frame) {
        if self.queue.push(frame.clone()).is_err() {
            self.pending = Some(frame);
        }
    }
    pub fn pop(&mut self) -> Option<Frame> {
        let frame = self.queue.pop();
        if let Some(pending) = self.pending.take() {
            if self.queue.push(pending.clone()).is_err() {
                self.pending = Some(pending);
            }
        }
        frame
    }
    fn disable(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
        self.data = None;
        self.control = None;
        self.outgoing.close();
        if let Some(handler) = self.handler.take() {
            // Keep the slot lock through cleanup: otherwise a new connection
            // could claim this device after the check but before the callback.
            if let Ok(active) = self.owner.active.lock() {
                if active
                    .get(&self.device)
                    .is_some_and(|slot| Arc::ptr_eq(slot, &self.slot))
                {
                    handler.disconnected(&self.device);
                }
            }
        }
        self.pending = None;
        self.queue = FrameQueue::new();
    }
}
impl Drop for PreviewSession {
    fn drop(&mut self) {
        self.disable();
    }
}
