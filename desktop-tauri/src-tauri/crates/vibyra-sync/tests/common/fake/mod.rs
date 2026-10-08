#![allow(dead_code)]
//! A small in-process implementation of the contract's account API (and of the VM's keys), for client and
//! engine tests. Faults are injected through the `FakeState` flags.
use std::collections::BTreeMap;
use std::sync::{Arc, Mutex};
use tiny_http::Server;

mod logins;
mod routes;
mod uploads;
pub use logins::LoginFake;
use routes::handle;
use vibyra_sync::crypto::{hex, open_bytes, public_from_secret, seal_bytes};

pub const TOKEN: &str = "test-token";
pub const VM_SECRET: [u8; 32] = [0x42; 32];

#[derive(Clone, Default)]
pub struct P {
    pub name: String,
    pub key: String,
    pub up_seq: u64,
    pub up_head: Option<String>,
    pub applied_seq: u64,
    pub resync: bool,
    pub transcripts_seq: u64,
    pub skipped: Option<String>,
}

#[derive(Clone)]
pub struct Blob {
    pub project: String,
    pub kind: String,
    pub seq: u64,
    pub base_seq: u64,
    pub head: String,
    pub sealed: Vec<u8>,
}

pub struct DownBlob {
    pub id: String,
    pub mac: String,
    pub project: String,
    pub kind: String,
    pub seq: u64,
    pub head: String,
    pub sealed: Vec<u8>,
    pub acked: Option<bool>,
}

#[derive(Default)]
pub struct FakeState {
    pub vm_key_published: bool,
    pub vm_key_override: Option<String>,
    pub macs: Vec<(String, String)>,
    pub projects: BTreeMap<String, P>,
    pub ups: Vec<Blob>,
    pub down: Vec<DownBlob>,
    /// Answer this many requests with 503 before doing anything.
    pub fail_next: u32,
    pub quota_exceeded: bool,
    /// On the next upload another client "wins": seq is bumped and 409 seq_conflict returned.
    pub conflict_once: bool,
    /// On the next upload the VM "lost its copy": resync flips on and an incremental is refused.
    pub resync_once_on_put: bool,
    pub requests: Vec<String>,
    pub login: LoginFake,
    pub claude_login: LoginFake,
    /// The phone consent version `GET /` reports (`None` sends `null`).
    pub consent: Option<u32>,
    /// The allowed project keys `GET /` reports as `access` (`None` = an older server, no `access`).
    pub access: Option<Vec<String>>,
    /// Bodies of `PUT /api/cloud-computer/access/projects`.
    pub access_puts: Vec<serde_json::Value>,
}

pub struct Fake {
    pub url: String,
    pub st: Arc<Mutex<FakeState>>,
    server: Arc<Server>,
    handle: Option<std::thread::JoinHandle<()>>,
}

impl Fake {
    pub fn start() -> Fake {
        let server = Arc::new(Server::http("127.0.0.1:0").unwrap());
        let url = format!("http://{}", server.server_addr().to_ip().unwrap());
        let st = Arc::new(Mutex::new(FakeState {
            vm_key_published: true,
            ..Default::default()
        }));
        let (s2, st2) = (server.clone(), st.clone());
        let handle = std::thread::spawn(move || {
            for rq in s2.incoming_requests() {
                handle(&st2, rq);
            }
        });
        Fake {
            url,
            st,
            server,
            handle: Some(handle),
        }
    }

    pub fn vm_public_hex(&self) -> String {
        hex(&public_from_secret(&VM_SECRET))
    }

    pub fn mark_applied(&self, name: &str) {
        let mut s = self.st.lock().unwrap();
        let p = s.projects.get_mut(name).unwrap();
        p.applied_seq = p.up_seq;
    }

    pub fn code_ups(&self) -> Vec<Blob> {
        self.st
            .lock()
            .unwrap()
            .ups
            .iter()
            .filter(|b| b.kind == "code")
            .cloned()
            .collect()
    }

    pub fn open(&self, blob: &Blob) -> Vec<u8> {
        open_bytes(&VM_SECRET, &blob.sealed).expect("the VM key opens the upload")
    }

    pub fn count(&self, prefix: &str) -> usize {
        self.st
            .lock()
            .unwrap()
            .requests
            .iter()
            .filter(|r| r.starts_with(prefix))
            .count()
    }

    /// Queue a blob for a Mac, sealed to that Mac's registered public key.
    pub fn push_down(
        &self,
        mac: &str,
        project: &str,
        kind: &str,
        seq: u64,
        head: &str,
        plain: &[u8],
    ) {
        let mut s = self.st.lock().unwrap();
        let pubhex = s
            .macs
            .iter()
            .find(|m| m.0 == mac)
            .expect("mac registered")
            .1
            .clone();
        let public = vibyra_sync::crypto::unhex::<32>(&pubhex).unwrap();
        let sealed = seal_bytes(&public, plain).unwrap();
        let id = format!("d{}", s.down.len() + 1);
        s.down.push(DownBlob {
            id,
            mac: mac.into(),
            project: project.into(),
            kind: kind.into(),
            seq,
            head: head.into(),
            sealed,
            acked: None,
        });
    }
}

impl Drop for Fake {
    fn drop(&mut self) {
        self.server.unblock();
        if let Some(h) = self.handle.take() {
            let _ = h.join();
        }
    }
}
