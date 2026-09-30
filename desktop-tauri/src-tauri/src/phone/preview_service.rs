//! Mac Preview of project websites and approved native windows over the device-scoped Host lane.
//! Advertised to phones as `previewV1` (and the older `previewHttpProofV1`).
mod agent_status;
mod automatic;
mod client;
mod companion;
mod compress;
mod control;
mod control_list;
mod control_origin;
mod control_trait;
mod discovery;
mod discovery_system;
mod frames;
mod headers;
mod http;
mod http_dispatch;
mod http_frames;
mod native_discovery;
mod native_handoff;
mod origin_rewrite;
mod remote_access;
mod run_agent;
mod run_control;
mod run_events;
mod run_list;
mod run_stop;
mod run_web;
#[cfg(all(test, unix))]
mod run_web_tests;
mod sandbox_probe;
mod stream_open;
mod upgrade;
mod upgrade_io;
pub mod watch;
mod window;

use super::{preview_grants::PreviewGrants, workspace::SharedWorkspace};
use parking_lot::{Condvar, Mutex};
use serde::Deserialize;
use std::collections::{HashMap, VecDeque};
use std::sync::{atomic::AtomicBool, mpsc, Arc};
use vibyra_core::preview::PreviewManager;
use vibyra_host::{PreviewFrame, ReceiveWindow, SendWindow, StreamKey};

// Eight live sockets plus bounded headroom for streams finishing cleanup.
const MAX_STREAMS: usize = 16;
const MAX_REQUEST_BODY: usize = 2 * 1024 * 1024;
// Vite development icon/vendor modules can exceed 16 MiB. Streaming credits
// still bound in-flight memory; retain a finite per-response byte ceiling.
const MAX_RESPONSE_BODY: usize = 32 * 1024 * 1024;

type DeviceKey = (String, u64);
type StreamId = (String, StreamKey);
type UpgradeSender = mpsc::SyncSender<(Vec<u8>, PreviewFrame)>;

#[derive(Clone)]
pub struct PreviewService {
    inner: Arc<Inner>,
}

struct Inner {
    handoff: Mutex<native_handoff::Handoff>,
    manager: Arc<PreviewManager>,
    grants: Arc<PreviewGrants>,
    workspace: SharedWorkspace,
    automatic: Mutex<HashMap<(String, String), discovery::DetectedServer>>,
    bindings: Mutex<HashMap<DeviceKey, Binding>>,
    streams: Mutex<HashMap<StreamId, Arc<Stream>>>,
    finished: Mutex<VecDeque<StreamId>>,
    subscribers: Mutex<HashMap<String, mpsc::SyncSender<PreviewFrame>>>,
    runs: Mutex<HashMap<run_control::RunKey, run_control::ActiveRun>>,
    plans: Mutex<HashMap<String, run_agent::Plan>>,
    /// The computer's "typing from phone" switch; window input obeys it.
    typing: Mutex<Option<Arc<AtomicBool>>>,
}

#[derive(Clone)]
struct Binding {
    window: Option<Arc<crate::window_preview::Session>>,
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
    remote_access: Option<Arc<dyn vibyra_host::PreviewAccess>>,
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
    pub fn new(
        manager: Arc<PreviewManager>,
        grants: Arc<PreviewGrants>,
        workspace: SharedWorkspace,
    ) -> Self {
        let inner = Arc::new(Inner {
            handoff: Mutex::default(),
            manager,
            grants,
            workspace,
            automatic: Mutex::new(HashMap::new()),
            bindings: Mutex::new(HashMap::new()),
            streams: Mutex::new(HashMap::new()),
            finished: Mutex::new(VecDeque::new()),
            subscribers: Mutex::new(HashMap::new()),
            runs: Mutex::default(),
            plans: Mutex::default(),
            typing: Mutex::default(),
        });
        Self::listen_for_runs(&inner);
        Self { inner }
    }

    pub fn set_typing(&self, typing: Arc<AtomicBool>) {
        *self.inner.typing.lock() = Some(typing);
    }

    fn typing_allowed(&self) -> bool {
        self.inner
            .typing
            .lock()
            .as_ref()
            .is_none_or(|typing| typing.load(std::sync::atomic::Ordering::SeqCst))
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
