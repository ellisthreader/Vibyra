use super::backend::DesktopBackend;
use super::workspace::UNFILED;
use serde_json::{json, Value};
pub const MANAGE_OFF: &str = crate::platform_text::for_computer("Typing from your phone is off. Turn it on in Vibyra on your Mac (Settings > iPhone connection) to start or close terminals from your phone.", "Typing from your phone is off. Turn it on in Vibyra on your computer (Settings > iPhone connection) to start or close terminals from your phone.");
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
            Some(
                kind @ ("shell" | "codex" | "claude" | "gemini" | "qwen" | "aider" | "opencode"),
            ) => kind,
            _ => return Err("Choose an available terminal runner".into()),
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
        let safe_mode = params
            .get("safeMode")
            .map(|value| value.as_bool().ok_or("Safe mode must be on or off"))
            .transpose()?
            .unwrap_or(false);
        let model = params
            .get("model")
            .map(|value| {
                value
                    .as_str()
                    .filter(|id| {
                        !id.is_empty() && id.len() <= 160 && !id.chars().any(char::is_control)
                    })
                    .ok_or("Choose a valid model")
            })
            .transpose()?;
        if kind == "shell" && model.is_some() {
            return Err("A plain terminal does not use an AI model".into());
        }
        if !matches!(kind, "shell" | "codex" | "claude") && model.is_none() {
            return Err("Choose an available model for this terminal runner".into());
        }
        let effort = params.get("effort");
        if let Some(effort) = effort {
            if kind == "shell"
                || model.is_none()
                || !(effort.is_null()
                    || matches!(
                        effort.as_str(),
                        Some("none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max")
                    ))
            {
                return Err("Choose a supported effort for an AI model".into());
            }
        }
        let permission = params
            .get("permissionMode")
            .map(|value| match value.as_str() {
                Some(mode @ ("standard" | "full")) if kind != "shell" => Ok(mode),
                _ => Err("Choose Standard or Full permissions for an AI terminal"),
            })
            .transpose()?;
        if permission == Some("full") && !matches!(kind, "codex" | "claude" | "gemini") {
            return Err("Full permissions are not supported by this AI runner".into());
        }
        let answer = match self.requests.remembered(request_id) {
            Some(answer) => answer,
            None => {
                let mut request = json!({"action":"create","projectId":project,
                    "kind":kind,"title":title,"requestId":request_id});
                request["safeMode"] = json!(safe_mode);
                if let Some(model) = model {
                    request["model"] = json!(model);
                }
                if let Some(effort) = effort {
                    request["effort"] = effort.clone();
                }
                if let Some(permission) = permission {
                    request["permissionMode"] = json!(permission);
                }
                let answer = self.requests.ask(request)?;
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
    /// The phone zooms the Mac grid; only legacy phones request a resize.
    pub(super) fn resize(&self, params: &Value) -> Result<Value, String> {
        self.native_id(params)?;
        Err(crate::platform_text::for_computer(
            "This Mac keeps its own terminal size. Update Vibyra on your phone to view it.",
            "This computer keeps its own terminal size. Update Vibyra on your phone to view it.",
        )
        .into())
    }
}
