//! The `Backend` trait impl: the phone's wire protocol, method by method.
//!
//! Split out of `backend.rs` to keep both sides under the 200-line first-party
//! standard. A child module rather than a sibling, deliberately —
//! `DesktopBackend`'s fields stay private, and only this module can still reach
//! them, so the split costs no visibility.

use serde_json::{json, Value};
use std::sync::mpsc;
use std::sync::Arc;
use vibyra_host::{Backend, PreviewHandler};

// Relative, not `crate::phone::…`: the examples include this tree directly, so
// there is no `phone` module at their crate root.
use super::super::stream;
use super::DesktopBackend;

impl Backend for DesktopBackend {
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        if let Some(result) = self.vault.dispatch(device, method, &params) {
            return result;
        }
        if let Some(result) = self.railway_tools.dispatch(device, method, &params) {
            return result;
        }
        match method {
            "host.state" => {
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
                        "scaffoldV1":true,"vibesToolsV1":true,
                        "previewHttpProofV1":self.preview.is_some()},
                    "projects":projects,
                    // The Mac's own Railway CLI, for the phone's Integrations page.
                    "railway":self.railway.status(),
                    "sessions":sessions,"sessionCount":count,
                    "nextCursor":null,"approvals":[],"devices":[]}))
            }
            "session.list" => {
                let (sessions, _) = self.sessions();
                let count = sessions.len();
                Ok(json!({"sessions":sessions,"sessionCount":count,"nextCursor":null}))
            }
            "session.snapshot" => self.snapshot(&params),
            "session.resize" => self.resize(&params),
            "session.create" => self.create_pane(&params),
            "session.stop" => self.close(&params),
            "session.claim" => self.claim(device, &params),
            "session.input" => self.input(device, &params),
            "session.release" => {
                if let (Ok(number), Some(lease)) =
                    (self.native_id(&params), params["lease"].as_str())
                {
                    self.control.release(device, number, lease);
                }
                Ok(json!({"ok":true}))
            }
            "approval.list" => Ok(json!([])),
            "preview.list" if self.preview.is_some() => {
                Ok(self.preview.as_ref().unwrap().list(device))
            }
            "preview.start" if self.preview.is_some() => self.preview.as_ref().unwrap().start(
                device,
                params["grantId"]
                    .as_str()
                    .ok_or("Select an approved Preview")?,
            ),
            "preview.open" if self.preview.is_some() => self.preview.as_ref().unwrap().open(
                device,
                params["grantId"]
                    .as_str()
                    .ok_or("Select an approved Preview")?,
            ),
            // Renaming a project, and dropping it from the list. Neither touches
            // the folder itself, so neither is the write that readOnly refuses.
            "project.rename" | "project.forget" => self.manage_project(method, &params),
            // Starting a project is the one thing a phone may make on this Mac.
            // It is not a general write: the plan is the wizard's own, checked
            // before a process runs, and the folder is new by definition.
            method if method.starts_with("scaffold.") => self.scaffolder.handle(method, &params),
            _ => Err(crate::platform_text::for_computer(
                "Use Vibyra on your Mac to start or stop terminals and open files.",
                "Use Vibyra on your computer to start or stop terminals and open files.",
            )
            .into()),
        }
    }
    fn subscribe(&self) -> mpsc::Receiver<Value> {
        stream::stream(
            self.manager.clone(),
            self.workspace.clone(),
            self.scaffolds.clone(),
            self.typing.clone(),
            self.generation.clone(),
        )
    }
    fn disconnected(&self, device: &str) {
        self.control.disconnected(device);
        if let Some(preview) = &self.preview {
            PreviewHandler::disconnected(preview.as_ref(), device);
        }
    }
    fn preview(&self, _device: &str) -> Option<Arc<dyn PreviewHandler>> {
        self.preview
            .as_ref()
            .map(|preview| preview.clone() as Arc<dyn PreviewHandler>)
    }
    fn pairing_notice(&self) -> &'static str {
        if self.vault.project().is_some() {
            crate::platform_text::for_computer("Trust lets this phone view all desktop terminal output, type into those terminals while typing from your phone is on in Settings, read the vault folder you chose in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read anything else on this Mac.", "Trust lets this phone view all desktop terminal output, type into those terminals while typing from your phone is on in Settings, read the vault folder you chose in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read anything else on this computer.")
        } else {
            "Trust lets this phone view all desktop terminal output, type into those terminals while typing from your phone is on in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read your files."
        }
    }
}
