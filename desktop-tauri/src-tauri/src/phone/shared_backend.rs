use super::backend::DesktopBackend;
use super::manage::Created;
use crate::shared_chats::SharedChats;
use serde_json::{json, Value};
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::Duration,
};
use vibyra_host::{Backend, PreviewHandler};

pub struct SharedBackend {
    pub terminal: DesktopBackend,
    pub chats: Arc<SharedChats>,
    pub typing: Arc<AtomicBool>,
}
impl SharedBackend {
    /// A terminal the phone asked for. A pane is named by the terminal
    /// backend; a shared chat is named from the chat list, or from the
    /// request itself while the engine has yet to list it.
    fn create(&self, params: &Value) -> Result<Value, String> {
        let id = match self.terminal.create(params)? {
            Created::Pane(session) => return Ok(session),
            Created::Conversation(id) => id,
        };
        let listed = self
            .chats
            .sessions()
            .unwrap_or_default()
            .into_iter()
            .find(|session| session["id"] == id);
        let mut session = listed.unwrap_or_else(|| {
            json!({"id":id,"projectId":params["projectId"],"title":params["title"],"kind":params["kind"],
                "runner":"conversation","status":"running","createdAt":"1970-01-01T00:00:00Z"})
        });
        session["readOnly"] = json!(true);
        session["canInput"] = json!(true);
        session["sharedChat"] = json!(true);
        Ok(session)
    }
}
impl Backend for SharedBackend {
    fn preview(&self, device: &str) -> Option<Arc<dyn PreviewHandler>> {
        self.terminal.preview(device)
    }
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        let typing = self.typing.load(Ordering::SeqCst);
        if method == "session.create" {
            return self.create(&params);
        }
        if method == "host.state" || method == "session.list" {
            let mut state = self.terminal.handle(device, method, params.clone())?;
            let mut sessions = self.chats.sessions().unwrap_or_default();
            // Only the chats the Mac's grid is drawing: the engine keeps every
            // conversation ever had, and those are history, not open terminals.
            let workspace = self.terminal.workspace.read();
            sessions.retain(|session| {
                session["id"]
                    .as_str()
                    .is_some_and(|id| workspace.shows_chat(id))
            });
            drop(workspace);
            for session in &mut sessions {
                session["readOnly"] = json!(true);
                session["canInput"] = json!(typing);
                session["sharedChat"] = json!(true);
            }
            sessions.extend(state["sessions"].as_array().cloned().unwrap_or_default());
            let count = sessions.len();
            let start = match params["cursor"].as_str() {
                Some(cursor) => {
                    sessions
                        .iter()
                        .position(|s| s["id"] == cursor)
                        .ok_or("Chat history changed; refresh it")?
                        + 1
                }
                None => 0,
            };
            let mut bytes = 0;
            let page: Vec<_> = sessions
                .into_iter()
                .skip(start)
                .take(50)
                .take_while(|session| {
                    bytes += serde_json::to_vec(session).map_or(usize::MAX / 256, |b| b.len());
                    bytes < 32 * 1024
                })
                .collect();
            state["nextCursor"] = if start + page.len() < count {
                page.last().map(|s| s["id"].clone()).unwrap_or(Value::Null)
            } else {
                Value::Null
            };
            state["sessionCount"] = json!(count);
            state["sessions"] = json!(page);
            if method == "host.state" {
                state["capabilities"]["canManage"] = json!(self.terminal.can_manage());
                state["capabilities"]["conversationV1"] = json!(true);
                state["capabilities"]["conversationProviders"] =
                    json!(["codex", "claude", "gemini"]);
                state["capabilities"]["sharedChatsV1"] = json!(true);
                let folders = state["projects"]
                    .as_array_mut()
                    .ok_or("Invalid project list")?;
                for project in self.chats.projects() {
                    if !folders.iter().any(|p| p["id"] == project["id"]) {
                        folders.push(project);
                    }
                }
            }
            return Ok(state);
        }
        if let Some(id) = params["sessionId"]
            .as_str()
            .filter(|id| self.chats.owns(id))
        {
            // Closing is the window's to do — it ends the engine session and
            // takes the card down on both screens, as its own button does.
            if method == "session.stop" {
                return self.terminal.close_chat(id);
            }
            return self.chats.remote(device, method, params, typing);
        }
        self.terminal.handle(device, method, params)
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        let (tx, rx) = mpsc::sync_channel(256);
        let terminal = self.terminal.subscribe();
        let chats = self.chats.subscribe();
        std::thread::spawn(move || {
            let mut seq = 0u64;
            loop {
                let mut events: Vec<_> = terminal.try_iter().collect();
                match chats.recv_timeout(Duration::from_millis(100)) {
                    Ok(event) => events.push(event),
                    Err(mpsc::RecvTimeoutError::Disconnected) => return,
                    Err(mpsc::RecvTimeoutError::Timeout) => {}
                }
                events.extend(chats.try_iter());
                for mut event in events {
                    seq += 1;
                    event["seq"] = json!(seq);
                    if tx.send(event).is_err() {
                        return;
                    }
                }
            }
        });
        rx
    }
    /// Conversation updates come only from the shared chats. The terminal
    /// half would start a phone's whole output stream, and drain the scaffold
    /// events a connected phone is waiting for, with no phone there to read it.
    fn subscribe_conversations(&self) -> mpsc::Receiver<Value> {
        self.chats.subscribe()
    }
    fn disconnected(&self, device: &str) {
        self.terminal.disconnected(device);
        self.chats.disconnected(device);
    }
    fn pairing_notice(&self) -> &'static str {
        "Trust lets this phone view desktop terminals and shared chats. While typing from your phone is on, it may type, send agent instructions and answer agent requests. Files and accounts stay on this computer."
    }
}
