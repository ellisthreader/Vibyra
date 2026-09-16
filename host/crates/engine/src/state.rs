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
    /// True for a project opened without write access - a Vibyra Desktop vault,
    /// never a standalone Host project. Enforced in `vibes_tools`, not just
    /// advertised: a read-only project refuses `write_file` regardless of what
    /// a compromised or out-of-date caller asks for.
    #[serde(skip)]
    pub read_only: bool,
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
            "approvals":[],"devices":[],"capabilities":{"conversationV1":true,"vibesToolsV1":true,"scaffoldV1":true}})
    }

    /// Shares a folder this computer just built (or was asked to build). The
    /// same folder twice is the same project; a name already taken is numbered.
    /// Remembered in the journal so a restart still lists it.
    pub fn adopt_project(&mut self, dir: &std::path::Path) -> Result<Value, String> {
        let canonical =
            std::fs::canonicalize(dir).map_err(|e| format!("project is unavailable: {e}"))?;
        if let Some(existing) = self.projects.iter().find(|p| p.path == canonical) {
            return Ok(json!({"id":existing.id,"name":existing.name,"path":existing.path}));
        }
        if self.projects.len() >= crate::projects::MAX_PROJECTS {
            return Err("this computer already shares 32 projects".into());
        }
        let leaf = canonical
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Project")
            .to_owned();
        let mut name = leaf.clone();
        let mut suffix = 2;
        while self.projects.iter().any(|p| p.name == name) {
            name = format!("{leaf} {suffix}");
            suffix += 1;
        }
        let project = crate::projects::build(name, canonical, false)?;
        self.projects.push(project);
        if let Err(error) = crate::projects::within_limit(&self.projects) {
            self.projects.pop();
            return Err(error);
        }
        let project = self.projects.last().expect("just pushed");
        self.journal.save_project(&project.name, &project.path)?;
        Ok(json!({"id":project.id,"name":project.name,"path":project.path}))
    }

    /// Renames a shared project. The folder on disk is untouched: this is the
    /// name the phone and the computer list it under, nothing more.
    pub fn rename_project(&mut self, id: &str, name: &str) -> Result<Value, String> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
            return Err("a project name is 1-64 characters".into());
        }
        if self
            .projects
            .iter()
            .any(|p| p.id != id && p.name == name)
        {
            return Err("this computer already shares a project by that name".into());
        }
        let index = self
            .projects
            .iter()
            .position(|p| p.id == id || p.name == id)
            .ok_or("project is not approved on this computer")?;
        self.projects[index].name = name.to_owned();
        let project = &self.projects[index];
        self.journal.save_project(&project.name, &project.path)?;
        let answer = json!({"id":project.id,"name":project.name,"path":project.path});
        self.emit("host.changed", json!({}));
        Ok(answer)
    }

    /// Stops sharing a folder. Nothing on disk is deleted — the project simply
    /// leaves the list, and can be shared again later.
    pub fn forget_project(&mut self, id: &str) -> Result<Value, String> {
        let index = self
            .projects
            .iter()
            .position(|p| p.id == id || p.name == id)
            .ok_or("project is not approved on this computer")?;
        if self.sessions.values().any(|s| s.meta.project_id == self.projects[index].id) {
            return Err("close this project's terminals on the computer first".into());
        }
        let project = self.projects.remove(index);
        self.journal.forget_project(&project.path)?;
        self.emit("host.changed", json!({}));
        Ok(json!({"ok":true}))
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
