//! What a phone asks this Mac's window to do to its terminals: start one in
//! a project, or close one.
//!
//! Rust owns the PTYs but the window owns the grid — which project a pane is
//! in, how it is launched (safe mode, account, model), and which conversation
//! cards are drawn. So the request is handed to the window and its answer
//! handed back, the way a pairing request is answered there. The connection
//! thread waits for that answer; a window that is not there to answer is told
//! to the phone in plain words rather than left hanging.
use parking_lot::Mutex;
use serde_json::Value;
use std::{
    collections::{HashMap, VecDeque},
    sync::mpsc,
    time::Duration,
};

/// Under the phone's own 20 s request timeout, so the phone hears this Mac's
/// answer rather than its own clock.
pub const WINDOW_TIMEOUT: Duration = Duration::from_secs(15);
pub const NO_WINDOW: &str = "Vibyra on your Mac did not answer. Open it there and try again.";

type Notify = Box<dyn Fn(&Value) + Send + Sync>;

#[derive(Default)]
pub struct TerminalRequests {
    /// Asked and not yet answered, in the order they came.
    pending: Mutex<Vec<Value>>,
    waiting: Mutex<HashMap<String, mpsc::SyncSender<Result<Value, String>>>>,
    /// The window's answer to each create, by the phone's `requestId`, so a
    /// retry after an uncertain send finds the terminal it already started
    /// rather than starting a second.
    created: Mutex<VecDeque<(String, Value)>>,
    notify: Mutex<Option<Notify>>,
}

impl TerminalRequests {
    /// How a new request reaches the window at once; without it the window
    /// only finds requests when it next asks for them.
    pub fn attach(&self, notify: Notify) {
        *self.notify.lock() = Some(notify);
    }
    pub fn pending(&self) -> Vec<Value> {
        self.pending.lock().clone()
    }
    /// Hands the request to the window and waits for its answer.
    pub fn ask(&self, mut request: Value) -> Result<Value, String> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let id: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
        request["id"] = Value::String(id.clone());
        let (send, receive) = mpsc::sync_channel(1);
        self.waiting.lock().insert(id.clone(), send);
        self.pending.lock().push(request.clone());
        if let Some(notify) = self.notify.lock().as_ref() {
            notify(&request);
        }
        let answer = receive.recv_timeout(WINDOW_TIMEOUT);
        self.waiting.lock().remove(&id);
        self.pending.lock().retain(|item| item["id"] != id);
        answer.unwrap_or_else(|_| Err(NO_WINDOW.into()))
    }
    /// The window's answer. False when nothing was waiting for it any more.
    pub fn reply(&self, id: &str, answer: Result<Value, String>) -> bool {
        self.waiting
            .lock()
            .remove(id)
            .is_some_and(|send| send.send(answer).is_ok())
    }
    pub fn remember(&self, request_id: &str, answer: Value) {
        let mut created = self.created.lock();
        created.push_back((request_id.to_owned(), answer));
        if created.len() > 64 {
            created.pop_front();
        }
    }
    pub fn remembered(&self, request_id: &str) -> Option<Value> {
        self.created
            .lock()
            .iter()
            .find(|(id, _)| id == request_id)
            .map(|(_, answer)| answer.clone())
    }
}
