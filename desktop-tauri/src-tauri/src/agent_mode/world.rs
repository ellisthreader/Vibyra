use parking_lot::Mutex;
use std::{collections::HashMap, path::PathBuf, sync::Arc};
use vibyra_core::{agent_runtime::TurnHandle, agentdb::AgentDb};

/// One account's Agent Mode world.
pub struct AgentWorld {
    pub db: Arc<AgentDb>,
    /// The root the database, agent homes and chat attachments all live under.
    pub root: PathBuf,
    /// The account scope every row is written with.
    pub account: String,
    pub(super) notify: super::hub::Notifier,
    /// Admission and deletion share this lock, so a chat has at most one task.
    pub(super) running: Mutex<HashMap<String, TurnHandle>>,
    pub(super) closed: std::sync::atomic::AtomicBool,
}

impl AgentWorld {
    pub fn changed(&self, chat: &str) {
        (self.notify)(&self.account, chat);
    }
    /// Claims a chat before preparation. Duplicate starts never replace a handle.
    pub fn begin(&self, chat_id: &str) -> Result<TurnHandle, String> {
        let mut running = self.running.lock();
        if self.closed.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("This account session has ended.".into());
        }
        if running.contains_key(chat_id) {
            return Err("That chat is already working. Stop it first.".into());
        }
        if running.len() >= 3 {
            return Err("Three tasks are already running. Wait for one to finish.".into());
        }
        let handle = TurnHandle::new();
        running.insert(chat_id.to_string(), handle.clone());
        Ok(handle)
    }

    /// Serializes cleanup with task admission.
    pub fn with_idle<T>(
        &self,
        chat_id: &str,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let running = self.running.lock();
        if self.closed.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("This account session has ended.".into());
        }
        if running.contains_key(chat_id) {
            return Err("Stop this task before changing its chat or attached files.".into());
        }
        action()
    }

    pub fn with_agent_idle<T>(
        &self,
        agent: &str,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        self.change_agent(agent, false, action)
    }
    pub fn change_agent<T>(
        &self,
        agent: &str,
        cancel: bool,
        action: impl FnOnce() -> Result<T, String>,
    ) -> Result<T, String> {
        let running = self.running.lock();
        if self.closed.load(std::sync::atomic::Ordering::SeqCst) {
            return Err("This account session has ended.".into());
        }
        let chats = vibyra_core::agent_chats::ids_for_agent(&self.db, &self.account, agent)
            .map_err(|e| e.to_string())?;
        for chat in chats {
            if let Some(handle) = running.get(&chat) {
                if !cancel {
                    return Err("Stop this teammate’s tasks before changing its setup.".into());
                }
                handle.cancel();
            }
        }
        action()
    }

    pub fn finish(&self, chat_id: &str) {
        self.running.lock().remove(chat_id);
    }

    /// Stops the turn running in `chat_id`, if any. Returns whether there was
    /// one — the UI uses that to tell "stopped it" from "nothing to stop".
    pub fn cancel(&self, chat_id: &str) -> bool {
        let handle = self.running.lock().get(chat_id).cloned();
        match handle {
            Some(handle) => {
                handle.cancel();
                true
            }
            None => false,
        }
    }

    pub fn busy(&self) -> Vec<String> {
        self.running.lock().keys().cloned().collect()
    }

    /// Whether the turn in `chat_id` has been stopped — or is no longer here
    /// at all, which for anything waiting on it means the same thing. The
    /// permission gate asks this: a card nobody will ever consume must not
    /// keep a provider process parked for half an hour.
    pub fn is_cancelled(&self, chat_id: &str) -> bool {
        match self.running.lock().get(chat_id) {
            Some(handle) => handle.cancelled(),
            None => true,
        }
    }

    /// Signals every turn. Called on sign-out and on app close, so no provider
    /// process outlives the session that started it.
    pub fn cancel_all(&self) {
        self.closed.store(true, std::sync::atomic::Ordering::SeqCst);
        for (_, handle) in self.running.lock().drain() {
            handle.cancel();
        }
    }
}
