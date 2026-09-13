use crate::journal::Journal;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{mpsc::SyncSender, Arc},
};

pub(crate) type Shared = Arc<Mutex<State>>;
pub(crate) const OUTPUT_LIMIT: usize = 8 * 1024;

#[derive(Clone, Serialize)]
pub(crate) struct Project {
    pub id: String,
    pub name: String,
    pub path: PathBuf,
    #[serde(skip)]
    pub directory: Arc<cap_std::fs::Dir>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Metadata {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub created_at: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub runner: Option<String>,
}

pub(crate) struct Lease {
    pub device: String,
    pub token: String,
}

pub(crate) struct Session {
    pub meta: Metadata,
    pub owner: String,
    pub request: String,
    pub native_id: Option<u64>,
    pub generation: String,
    pub output: String,
    pub offset: u64,
    pub lease: Option<Lease>,
    pub inputs: HashMap<String, [u8; 32]>,
}

impl Session {
    pub fn restored(meta: Metadata, owner: String, request: String) -> Self {
        Self {
            meta,
            owner,
            request,
            native_id: None,
            generation: uuid::Uuid::new_v4().to_string(),
            output: String::new(),
            offset: 0,
            lease: None,
            inputs: HashMap::new(),
        }
    }

    pub fn append(&mut self, output: &str) {
        self.offset += output.len() as u64;
        self.output.push_str(output);
        if self.output.len() > OUTPUT_LIMIT {
            let mut end = self.output.len() - OUTPUT_LIMIT;
            while !self.output.is_char_boundary(end) {
                end += 1;
            }
            self.output.drain(..end);
        }
    }
}

pub(crate) struct State {
    pub projects: Vec<Project>,
    pub sessions: HashMap<String, Session>,
    pub native: HashMap<u64, String>,
    pub subscribers: Vec<SyncSender<Value>>,
    pub seq: u64,
    pub journal: Journal,
    pub conversations: HashMap<String, crate::conversation::model::Conversation>,
    pub preview_ports: HashSet<(String, u16)>,
}

impl State {
    pub fn new(
        projects: Vec<Project>,
        journal: Journal,
        sessions: HashMap<String, Session>,
    ) -> Self {
        Self {
            projects,
            journal,
            sessions,
            native: HashMap::new(),
            subscribers: Vec::new(),
            seq: 0,
            preview_ports: HashSet::new(),
            conversations: HashMap::new(),
        }
    }

    pub fn emit(&mut self, event: &str, data: Value) {
        self.seq += 1;
        let event = json!({"event":event,"seq":self.seq,"data":data});
        self.subscribers
            .retain(|subscriber| subscriber.try_send(event.clone()).is_ok());
    }

    pub fn snapshot(&self) -> Value {
        let history = self
            .history(&json!({}), 32 * 1024)
            .expect("default history parameters");
        json!({"protocol":1,"host":{"id":"local","name":"Vibyra Host",
            "platform":std::env::consts::OS},"projects":self.projects,"sessions":history["sessions"],
            "sessionCount":history["sessionCount"],"nextCursor":history["nextCursor"],
            "approvals":[],"devices":[],"capabilities":{"conversationV1":true,"vibesToolsV1":true}})
    }

    pub fn resolve_project(&self, value: &str) -> Result<&Project, String> {
        self.projects
            .iter()
            .find(|p| p.id == value || p.name == value)
            .ok_or_else(|| "project is not approved on this computer".into())
    }

    pub fn session(&self, id: &str) -> Result<&Session, String> {
        self.sessions
            .get(id)
            .ok_or_else(|| "session not found".into())
    }
}
