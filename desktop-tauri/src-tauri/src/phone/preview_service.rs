//! HTTP-only Mac Preview proof over the authenticated, device-scoped Host lane.
//! Product `previewV1` stays off until WebSocket/HMR and cellular acceptance.
mod automatic;
mod control;
mod control_list;
mod control_origin;
mod discovery;
mod frames;
mod headers;
mod http;
mod http_frames;
mod origin_rewrite;
mod upgrade;
mod upgrade_io;

use super::preview_grants::PreviewGrants;
use super::workspace::SharedWorkspace;
use parking_lot::{Condvar, Mutex};
use serde::Deserialize;
use std::collections::{HashMap, VecDeque};
use std::sync::{atomic::AtomicBool, mpsc, Arc};
use vibyra_core::preview::PreviewManager;
use vibyra_host::{PreviewFrame, ReceiveWindow, SendWindow, StreamKey};

// The phone admits eight live sockets; a completed stream can still be crossing
// the bridge when its successor opens, so leave bounded cleanup headroom.
const MAX_STREAMS: usize = 16;
const MAX_REQUEST_BODY: usize = 2 * 1024 * 1024;
const MAX_RESPONSE_BODY: usize = 16 * 1024 * 1024;

type DeviceKey = (String, u64);
type StreamId = (String, StreamKey);
type UpgradeSender = mpsc::SyncSender<(Vec<u8>, PreviewFrame)>;

#[derive(Clone)]
pub struct PreviewService {
    inner: Arc<Inner>,
}

impl super::backend::PreviewControl for PreviewService {
    fn list(&self, device: &str) -> serde_json::Value {
        PreviewService::list(self, device)
    }
    fn start(&self, device: &str, grant_id: &str) -> Result<serde_json::Value, String> {
        PreviewService::start(self, device, grant_id)
    }
    fn open(&self, device: &str, grant_id: &str) -> Result<serde_json::Value, String> {
        PreviewService::open(self, device, grant_id)
    }
}

struct Inner {
    manager: Arc<PreviewManager>,
    grants: Arc<PreviewGrants>,
    workspace: SharedWorkspace,
    typing: Arc<AtomicBool>,
    automatic: Mutex<HashMap<(String, String), discovery::DetectedServer>>,
    bindings: Mutex<HashMap<DeviceKey, Binding>>,
    streams: Mutex<HashMap<StreamId, Arc<Stream>>>,
    finished: Mutex<VecDeque<StreamId>>,
    subscribers: Mutex<HashMap<String, mpsc::SyncSender<PreviewFrame>>>,
}

#[derive(Clone)]
struct Binding {
    grant_id: String,
    canonical_root: std::path::PathBuf,
    root: std::path::PathBuf,
    target_id: String,
    origin: reqwest::Url,
    runtime_id: u64,
    attached_port: Option<u16>,
    start_path: String,
    automatic: Option<discovery::DetectedServer>,
}

struct Stream {
    inbound: Mutex<Inbound>,
    outbound: Mutex<SendWindow>,
    wake: Condvar,
    canceled: AtomicBool,
    upgrade: Mutex<Option<UpgradeSender>>,
}

struct Inbound {
    window: ReceiveWindow,
    chunks: u32,
    metadata: Option<RequestMetadata>,
    upgraded: bool,
    body: Vec<u8>,
}

#[derive(Deserialize)]
struct RequestMetadata {
    v: u8,
    kind: String,
    method: String,
    path: String,
    headers: HashMap<String, String>,
    #[serde(rename = "browserOrigin")]
    browser_origin: Option<String>,
}

impl PreviewService {
    #[cfg_attr(not(test), allow(dead_code))]
    pub fn new(
        manager: Arc<PreviewManager>,
        grants: Arc<PreviewGrants>,
        workspace: SharedWorkspace,
    ) -> Self {
        Self::new_with_typing(manager, grants, workspace, Arc::new(AtomicBool::new(false)))
    }

    pub fn new_with_typing(
        manager: Arc<PreviewManager>,
        grants: Arc<PreviewGrants>,
        workspace: SharedWorkspace,
        typing: Arc<AtomicBool>,
    ) -> Self {
        Self {
            inner: Arc::new(Inner {
                manager,
                grants,
                workspace,
                typing,
                automatic: Mutex::new(HashMap::new()),
                bindings: Mutex::new(HashMap::new()),
                streams: Mutex::new(HashMap::new()),
                finished: Mutex::new(VecDeque::new()),
                subscribers: Mutex::new(HashMap::new()),
            }),
        }
    }

    fn finished(&self, device: &str, key: StreamKey) -> bool {
        self.inner.finished.lock().contains(&(device.into(), key))
    }

    fn mark_finished(&self, device: &str, key: StreamKey) {
        let mut finished = self.inner.finished.lock();
        if finished.len() >= 256 {
            finished.pop_front();
        }
        finished.push_back((device.into(), key));
    }
}
