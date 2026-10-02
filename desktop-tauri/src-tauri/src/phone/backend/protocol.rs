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
        if matches!(
            method,
            "scaffold.start" | "scaffold.cancel" | "scaffold.adopt"
        ) && !self.control.typing()
        {
            return Err(super::super::control::TYPING_OFF.into());
        }
        if let Some(result) = self.vault.dispatch(device, method, &params) {
            return result;
        }
        if let Some(result) = self.railway_tools.dispatch(device, method, &params) {
            return result;
        }
        if let Some(result) = self.ai_accounts(method, &params) {
            return result;
        }
        if matches!(
            method,
            "preview.start" | "preview.open" | "preview.run" | "preview.window.share"
        ) {
            crate::plan_limits::current().admit_preview()?;
        }
        if matches!(method, "scaffold.start" | "scaffold.adopt") {
            crate::plan_limits::admit_new_project()?;
        }
        match method {
            "host.state" => self.host_state(),
            "session.list" => {
                let (sessions, _) = self.sessions();
                let count = sessions.len();
                Ok(json!({"sessions":sessions,"sessionCount":count,"nextCursor":null}))
            }
            "session.snapshot" => self.snapshot(&params),
            "session.resize" => self.resize(&params),
            "session.models" => {
                let mut catalogue = self.requests.ask(json!({"action":"models"}))?;
                catalogue["permissionsVersion"] = json!(1);
                if catalogue["effortSelection"] == true { catalogue["effortVersion"] = json!(1); }
                catalogue["runnerKinds"] =
                    json!(["codex", "claude", "gemini", "qwen", "aider", "opencode"]);
                Ok(catalogue)
            }
            "session.create" => self.create_pane(&params),
            "session.resumeSaved" => self.saved_action(method, &params),
            "session.stop" if params["sessionId"].as_str().is_some_and(|id| id.contains("-saved-")) => self.saved_action(method, &params),
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
                let preview = self.preview.as_ref().unwrap();
                Ok(if params["windowHandoffV1"] == true {
                    preview.handoff(device)
                } else if params["windowV1"] == true {
                    preview.list_windows(device)
                } else {
                    preview.list(device)
                })
            }
            "preview.window.share" if self.preview.is_some() && params["viewOnly"] == true => {
                self.preview.as_ref().unwrap().share_window(
                    device,
                    params["candidateId"]
                        .as_str()
                        .ok_or("Select a project window")?,
                )
            }
            "preview.start" if self.preview.is_some() => self.preview.as_ref().unwrap().start(
                device,
                params["grantId"]
                    .as_str()
                    .ok_or("Select an approved Preview")?,
            ),
            "preview.close" if self.preview.is_some() => {
                let generation = params["generation"]
                    .as_str()
                    .and_then(|s| s.parse().ok())
                    .ok_or("Invalid Preview session")?;
                self.preview.as_ref().unwrap().close(device, generation);
                Ok(json!({"ok":true}))
            }
            // Starting a program is more than viewing: it needs the same
            // permission as typing into a terminal from this phone.
            "preview.run" | "preview.stop" if self.preview.is_some() && !self.control.typing() => {
                Err("Turn on typing from your phone in Vibyra's settings on your computer to run apps.".into())
            }
            "preview.run" if self.preview.is_some() => {
                self.preview.as_ref().unwrap().run(device, &params)
            }
            "preview.stop" if self.preview.is_some() => {
                self.preview.as_ref().unwrap().stop_run(device, &params)
            }
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
            crate::platform_text::for_computer("Trust lets this phone view all desktop terminal output, type into terminals while typing from your phone is on in Settings, read the vault folder you chose in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read anything else on this Mac.", "Trust lets this phone view all desktop terminal output, type into terminals while typing from your phone is on in Settings, read the vault folder you chose in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read anything else on this computer.")
        } else {
            "Trust lets this phone view all desktop terminal output, type into terminals while typing from your phone is on in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read your files."
        }
    }
}
