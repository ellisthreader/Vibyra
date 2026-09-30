//! Private, single-client attachment for the stock Codex TUI. The engine stays
//! on stdio; only request IDs and Vibyra's question tool are adapted here.
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{mpsc::SyncSender, Arc},
};

pub(super) type BeforeRequest = dyn Fn(&mut Value) -> Result<(), String> + Send + Sync;
pub(super) struct Bridge {
    pub thread: String,
    pub initialize: Value,
    pub before: Arc<BeforeRequest>,
    pub peer: Mutex<Option<SyncSender<Value>>>,
    routes: Mutex<HashMap<String, (Value, String)>>,
    pending: Mutex<HashMap<String, Value>>,
    pub endpoint: String,
    pub initial: Mutex<Option<Value>>,
    #[cfg(unix)]
    pub _directory: tempfile::TempDir,
}
impl Bridge {
    pub fn new(
        thread: String,
        initialize: Value,
        before: Arc<BeforeRequest>,
        #[cfg(unix)] directory: tempfile::TempDir,
    ) -> Self {
        Self {
            thread,
            initialize,
            before,
            peer: Mutex::new(None),
            routes: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            initial: Mutex::new(None),
            #[cfg(unix)]
            endpoint: format!("unix://{}", directory.path().join("rpc.sock").display()),
            #[cfg(not(unix))]
            endpoint: String::new(),
            #[cfg(unix)]
            _directory: directory,
        }
    }
    pub fn send(&self, value: Value) {
        let mut peer = self.peer.lock();
        if peer.as_ref().is_some_and(|p| p.try_send(value).is_err()) {
            *peer = None;
        }
    }
    pub fn provider(&self, value: &Value) -> bool {
        if value.get("method").is_none() {
            let key = value["id"].as_str().unwrap_or("");
            let route = self.routes.lock().remove(key);
            if let Some((id, method)) = route {
                if method == "turn/start" && value.get("error").is_some() {
                    let _ = (self.before)(&mut json!({"method":"vibyra/terminalFailed"}));
                }
                let mut reply = value.clone();
                reply["id"] = id;
                self.send(reply);
                if method == "thread/resume" && value.get("result").is_some() {
                    let pending: Vec<_> = self.pending.lock().values().cloned().collect();
                    for request in pending {
                        self.provider(&request);
                    }
                }
                return true;
            }
            return false;
        }
        let mut public = value.clone();
        if value["method"] == "turn/started" {
            *self.initial.lock() = None;
        }
        if value.get("id").is_some() {
            self.pending
                .lock()
                .insert(value["id"].to_string(), value.clone());
            if value["method"] == "item/tool/call"
                && value["params"]["tool"] == super::question_tool::NAME
            {
                public["method"] = json!("item/tool/requestUserInput");
                public["params"]["questions"] = value["params"]["arguments"]["questions"].clone();
                public["params"]["itemId"] = value["params"]["callId"].clone();
            }
        }
        if value["method"] == "serverRequest/resolved" {
            self.pending
                .lock()
                .remove(&value["params"]["requestId"].to_string());
        }
        self.send(public);
        false
    }
    pub fn claim_response(&self, value: &Value) -> Result<(), String> {
        if value.get("method").is_none()
            && value.get("id").is_some()
            && self
                .pending
                .lock()
                .remove(&value["id"].to_string())
                .is_none()
        {
            return Err("This request has already been answered or expired".into());
        }
        Ok(())
    }
    pub fn client(&self, mut value: Value) -> Result<Option<Value>, String> {
        let method = value["method"].as_str().unwrap_or("").to_owned();
        if method == "initialize" {
            self.send(json!({"id":value["id"],"result":self.initialize}));
            return Ok(None);
        }
        if method == "initialized" {
            return Ok(None);
        }
        if matches!(
            method.as_str(),
            "thread/start"
                | "thread/fork"
                | "thread/archive"
                | "thread/unsubscribe"
                | "thread/delete"
                | "thread/rollback"
                | "thread/revert"
        ) {
            return Err("Use Vibyra's New terminal or Close controls to change conversations; this terminal stays attached to its phone chat.".into());
        }
        if value["params"]["threadId"]
            .as_str()
            .is_some_and(|id| id != self.thread)
        {
            return Err("This terminal belongs to a different conversation".into());
        }
        if method.is_empty() {
            let pending = self
                .pending
                .lock()
                .get(&value["id"].to_string())
                .cloned()
                .ok_or("This request has already been answered or expired")?;
            if pending["method"] == "item/tool/call"
                && pending["params"]["tool"] == super::question_tool::NAME
                && value.get("result").is_some()
            {
                value["result"] = super::question_tool::result(value["result"].clone());
            }
        }
        (self.before)(&mut value)?;
        if let Some(mut initial) = self.initial.lock().clone() {
            let page = json!({"data":[],"nextCursor":null,"backwardsCursor":null});
            let result = match method.as_str() {
                "thread/resume" => {
                    initial["initialTurnsPage"] = page;
                    Some(initial)
                }
                "thread/turns/list" | "thread/items/list" => Some(page),
                _ => None,
            };
            if let Some(result) = result {
                self.send(json!({"id":value["id"],"result":result}));
                return Ok(None);
            }
        }
        if !method.is_empty() && value.get("id").is_some() {
            let mut routes = self.routes.lock();
            if routes.len() >= 256 {
                return Err("Too many pending terminal requests; reconnect the terminal".into());
            }
            let key = format!("terminal:{}", uuid::Uuid::new_v4());
            routes.insert(key.clone(), (value["id"].clone(), method));
            value["id"] = json!(key);
        }
        Ok(Some(value))
    }
    pub fn detached(&self) {
        *self.peer.lock() = None;
        self.routes.lock().clear();
    }
}
