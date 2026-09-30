//! Saved Mac panes have no PTY yet. Keep their identity separate from live sessions.
use super::backend::DesktopBackend;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedPane {
    pub id: i64,
    pub project_id: String,
    pub title: String,
    pub kind: String,
}
impl DesktopBackend {
    fn saved_id(&self, id: i64) -> String {
        format!("{}-saved-{}", self.id(0), id.unsigned_abs())
    }
    pub(super) fn saved_sessions(&self) -> Vec<Value> {
        let workspace = self.workspace.read();
        workspace.saved.iter().filter(|pane| workspace.has_project(&pane.project_id))
            .map(|pane| json!({"id":self.saved_id(pane.id),"projectId":pane.project_id,
                "title":pane.title,"kind":match pane.kind.as_str() {
                    kind @ ("codex" | "claude" | "gemini" | "qwen" | "aider" | "opencode") => kind, _ => "shell" },
                "status":"exited","saved":true,"readOnly":true,"canInput":false,
                "createdAt":"1970-01-01T00:00:00Z"})).collect()
    }
    pub(super) fn saved_action(&self, method: &str, params: &Value) -> Result<Value, String> {
        if !self.can_manage() {
            return Err(super::manage::MANAGE_OFF.into());
        }
        let id = params["sessionId"]
            .as_str()
            .ok_or("Missing saved terminal")?;
        let pane = self
            .workspace
            .read()
            .saved
            .iter()
            .find(|pane| self.saved_id(pane.id) == id)
            .cloned()
            .ok_or("This saved terminal is no longer available")?;
        if !self.workspace.read().has_project(&pane.project_id) {
            return Err("This saved terminal project is no longer open".into());
        }
        let action = if method == "session.resumeSaved" {
            "resumeSaved"
        } else {
            "close"
        };
        let answer = self
            .requests
            .ask(json!({"action":action,"paneId":pane.id,"projectId":pane.project_id}))?;
        if action == "close" {
            return Ok(answer);
        }
        let started = answer["paneId"]
            .as_u64()
            .ok_or("The terminal did not resume")?;
        Ok(
            json!({"id":self.id(started),"projectId":pane.project_id,"title":pane.title,
            "kind":pane.kind,"status":"running","readOnly":true,"canInput":true,
            "createdAt":"1970-01-01T00:00:00Z"}),
        )
    }
}
