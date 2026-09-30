//! Starting and closing this Mac's terminals from a phone.
//!
//! Both are behind the same switch as typing — a shell started from a phone
//! is any command the Mac's user can run, and closing one ends work in front
//! of the person — and both go through the window (`requests.rs`), which is
//! what knows how a terminal in a project is launched and drawn.
use super::backend::DesktopBackend;
use super::workspace::UNFILED;
use serde_json::{json, Value};

pub const MANAGE_OFF: &str = crate::platform_text::for_computer("Typing from your phone is off. Turn it on in Vibyra on your Mac (Settings > iPhone connection) to start or close terminals from your phone.", "Typing from your phone is off. Turn it on in Vibyra on your computer (Settings > iPhone connection) to start or close terminals from your phone.");

/// What the window started: a pane of its own, or a shared chat that the
/// combined backend names from the chat list.
pub enum Created {
    Pane(Value),
    Conversation(String),
}

impl DesktopBackend {
    /// Whether this phone may start and close terminals here.
    pub fn can_manage(&self) -> bool {
        self.control.typing()
    }
    /// Renaming a project, or dropping it from the list. The window owns the
    /// list, so both are asked of it rather than done here — and both are about
    /// the list only: no folder on this Mac is moved, renamed or deleted.
    pub(super) fn manage_project(&self, method: &str, params: &Value) -> Result<Value, String> {
        if !self.can_manage() {
            return Err(MANAGE_OFF.into());
        }
        let project = params["projectId"]
            .as_str()
            .filter(|id| *id != UNFILED)
            .ok_or("Choose a project")?;
        if !self.workspace.read().has_project(project) {
            return Err(crate::platform_text::for_computer(
                "Vibyra on your Mac is not showing that project",
                "Vibyra on your computer is not showing that project",
            )
            .into());
        }
        if method == "project.forget" {
            return self
                .requests
                .ask(json!({"action":"forget","projectId":project}));
        }
        let name = params["name"].as_str().unwrap_or("").trim();
        if name.is_empty() || name.chars().count() > 64 || name.chars().any(char::is_control) {
            return Err("A project name is 1-64 characters".into());
        }
        self.requests
            .ask(json!({"action":"rename","projectId":project,"name":name}))
    }
    pub(super) fn create(&self, params: &Value) -> Result<Created, String> {
        if !self.can_manage() {
            return Err(MANAGE_OFF.into());
        }
        let project = params["projectId"]
            .as_str()
            .filter(|id| *id != UNFILED)
            .ok_or("Choose a project")?;
        if !self.workspace.read().has_project(project) {
            return Err(crate::platform_text::for_computer(
                "This project is not open in Vibyra on your Mac.",
                "This project is not open in Vibyra on your computer.",
            )
            .into());
        }
        let kind = match params["kind"].as_str() {
            Some(kind @ ("shell" | "codex" | "claude")) => kind,
            _ => return Err("Choose Terminal, Codex or Claude Code".into()),
        };
        let title = params["title"]
            .as_str()
            .map(str::trim)
            .filter(|title| !title.is_empty() && title.len() <= 120)
            .ok_or("Use a session title between 1 and 120 characters.")?;
        let request_id = params["requestId"]
            .as_str()
            .filter(|id| !id.is_empty())
            .ok_or("Missing requestId")?;
        let answer = match self.requests.remembered(request_id) {
            Some(answer) => answer,
            None => {
                let answer = self
                    .requests
                    .ask(json!({"action":"create","projectId":project,
                    "kind":kind,"title":title,"requestId":request_id}))?;
                self.requests.remember(request_id, answer.clone());
                answer
            }
        };
        if let Some(id) = answer["conversationId"].as_str() {
            return Ok(Created::Conversation(id.to_owned()));
        }
        let pane = answer["paneId"]
            .as_u64()
            .ok_or(crate::platform_text::for_computer(
                "Vibyra on your Mac did not name the new terminal",
                "Vibyra on your computer did not name the new terminal",
            ))?;
        Ok(Created::Pane(
            json!({"id":self.id(pane),"projectId":project,"title":title,
            "kind":kind,"status":"running","createdAt":"1970-01-01T00:00:00Z",
            "readOnly":true,"canInput":true}),
        ))
    }
    /// The terminal backend on its own serves panes; a chat it cannot name.
    pub(super) fn create_pane(&self, params: &Value) -> Result<Value, String> {
        match self.create(params)? {
            Created::Pane(session) => Ok(session),
            Created::Conversation(_) => Err("Reconnect to open this chat".into()),
        }
    }
    /// Closes one of the Mac's own panes, the way its close button does.
    pub(super) fn close(&self, params: &Value) -> Result<Value, String> {
        if !self.can_manage() {
            return Err(MANAGE_OFF.into());
        }
        let number = self.native_id(params)?;
        if !self.manager.list().iter().any(|s| s.id == number) {
            return Err(crate::platform_text::for_computer(
                "Terminal closed on the Mac",
                "Terminal closed on the computer",
            )
            .into());
        }
        self.requests
            .ask(json!({"action":"close","paneId":number}))?;
        Ok(json!({"ok":true}))
    }
    /// Closes a shared chat on both screens, the way the Mac's own Close
    /// terminal button does: the engine session ends and the card goes.
    pub(super) fn close_chat(&self, id: &str) -> Result<Value, String> {
        if !self.can_manage() {
            return Err(MANAGE_OFF.into());
        }
        self.requests
            .ask(json!({"action":"close","conversationId":id}))?;
        Ok(json!({"ok":true}))
    }
    /// A phone never sets this Mac's grid. The pane on the Mac is what the
    /// person is working in, and shrinking it to a phone's ~46 columns broke
    /// their display; the phone draws this Mac's grid and zooms it instead.
    /// Only a phone from before that change still asks, and the answer tells
    /// it what to do.
    pub(super) fn resize(&self, params: &Value) -> Result<Value, String> {
        self.native_id(params)?;
        Err(crate::platform_text::for_computer(
            "This Mac keeps its own terminal size. Update Vibyra on your phone to view it.",
            "This computer keeps its own terminal size. Update Vibyra on your phone to view it.",
        )
        .into())
    }
}
