use super::DesktopBackend;
use serde_json::{json, Value};

impl DesktopBackend {
    pub(super) fn host_state(&self) -> Result<Value, String> {
        let (sessions, unfiled) = self.sessions();
        let count = sessions.len();
        let mut projects = self.workspace.read().folders(unfiled);
        if let Some(project) = self.vault.project() {
            projects.push(project);
        }
        if let Some(project) = self.railway_tools.project(&self.railway.status()) {
            projects.push(project);
        }
        Ok(json!({"protocol":1,
            "capabilities":{"readOnly":true,"canInput":self.control.typing(),"canManage":self.can_manage(),
                "scaffoldV1":true,"vibesToolsV1":true,"fundedTerminalV1":true,"terminalModelsV1":true,
                "previewHttpProofV1":self.preview.is_some(),"previewV1":self.preview.is_some(),
                "previewRunV1":self.preview.is_some(),
                "aiAccountsV1":self.provider_auth.is_some(),
                "previewWindowBytes":vibyra_host::SEND_WINDOW_BYTES},
            "projects":projects,
            // The Mac's own Railway CLI, for the phone's Integrations page.
            "railway":self.railway.status(),
            "sessions":sessions,"sessionCount":count,
            "nextCursor":null,"approvals":[],"devices":[]}))
    }
}
