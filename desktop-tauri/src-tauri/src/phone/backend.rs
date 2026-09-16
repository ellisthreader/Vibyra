use super::control::Control;
use super::frames;
use super::railway::RailwayCli;
use super::requests::TerminalRequests;
use super::scaffold::{Scaffolder, Scaffolds, SharedScaffolds};
use super::stream;
use super::vault::Vault;
use super::workspace::{SharedWorkspace, UNFILED};
use serde_json::{json, Value};
use std::sync::{atomic::AtomicBool, mpsc, Arc};
use vibyra_core::pty::PtyManager;
use vibyra_host::Backend;

pub struct DesktopBackend {
    pub(super) manager: Arc<PtyManager>,
    pub(super) workspace: SharedWorkspace,
    pub(super) control: Control,
    typing: Arc<AtomicBool>,
    generation: String,
    vault: Arc<Vault>,
    railway: Arc<RailwayCli>,
    pub(super) requests: Arc<TerminalRequests>,
    pub(super) scaffolds: SharedScaffolds,
    scaffolder: Scaffolder,
}
impl DesktopBackend {
    /// `typing` is the Mac's switch for letting phones type; it is read on
    /// every claim and keystroke, so flipping it takes effect at once.
    pub fn new(
        manager: Arc<PtyManager>,
        workspace: SharedWorkspace,
        typing: Arc<AtomicBool>,
        vault: Arc<Vault>,
        requests: Arc<TerminalRequests>,
    ) -> Result<Self, String> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let generation = bytes.iter().map(|b| format!("{b:02x}")).collect();
        let scaffolds: SharedScaffolds = Arc::new(parking_lot::Mutex::new(Scaffolds::default()));
        let scaffolder = Scaffolder::new(scaffolds.clone(), workspace.clone(), requests.clone());
        let railway = RailwayCli::start();
        Ok(Self {
            manager,
            workspace,
            control: Control::new(typing.clone()),
            typing,
            generation,
            vault,
            railway,
            requests,
            scaffolds,
            scaffolder,
        })
    }
    pub(super) fn id(&self, id: u64) -> String {
        format!("{}-{id}", self.generation)
    }
    /// Every live terminal, under the project the desktop is showing it in and
    /// the name it shows it by. The flag reports whether any of them landed in
    /// the unfiled folder, which is the only reason to offer that folder.
    ///
    /// `readOnly` keeps its meaning — a phone cannot start, stop or browse —
    /// and `canInput` is the separate answer to whether it may type.
    fn sessions(&self) -> (Vec<Value>, bool) {
        let workspace = self.workspace.read();
        let typing = self.control.typing();
        let mut unfiled = false;
        let sessions = self.manager.list().into_iter().take(128).map(|s| {
            let (project, title) = workspace.place(s.id, &s.title);
            unfiled |= project == UNFILED;
            json!({
                "id":self.id(s.id), "projectId":project, "title":title,
                "kind":match s.agent_id.as_str() { "codex" => "codex", "claude" => "claude", _ => "shell" },
                "status":if s.alive {"running"} else {"exited"}, "createdAt":"1970-01-01T00:00:00Z",
                "readOnly":true, "canInput":typing
            })
        }).collect();
        (sessions, unfiled)
    }
    /// The running terminal a request names, and every open one alongside it.
    fn live(&self, params: &Value) -> Result<(u64, Vec<u64>), String> {
        let number = self.native_id(params)?;
        let sessions = self.manager.list();
        match sessions.iter().find(|s| s.id == number) {
            Some(s) if s.alive => Ok((number, sessions.iter().map(|s| s.id).collect())),
            Some(_) => Err("This terminal has stopped on the Mac".into()),
            None => Err("Terminal closed on the Mac".into()),
        }
    }
    fn claim(&self, device: &str, params: &Value) -> Result<Value, String> {
        let (number, open) = self.live(params)?;
        let lease = self.control.claim(device, number, &open)?;
        Ok(json!({"lease":lease,"generation":self.generation}))
    }
    /// Keystrokes from the phone reach the same PTY the Mac's pane is drawing,
    /// so the person sees them land on both screens.
    fn input(&self, device: &str, params: &Value) -> Result<Value, String> {
        let (number, _) = self.live(params)?;
        if params["generation"].as_str() != Some(self.generation.as_str()) {
            return Err("This desktop session expired; reconnect".into());
        }
        let input_id = params["inputId"].as_str().unwrap_or_default();
        let lease = params["lease"].as_str().unwrap_or_default();
        let data = params["data"].as_str().unwrap_or_default();
        self.control
            .input(device, number, lease, input_id, data, |bytes| {
                self.manager
                    .write_input(number, bytes)
                    .map_err(|e| e.to_string())
            })?;
        Ok(json!({"accepted":true,"inputId":input_id}))
    }
    /// `{generation}-{id}` back to the PTY it names, refusing ids minted by a
    /// previous run of this app — their terminals are gone.
    pub(super) fn native_id(&self, params: &Value) -> Result<u64, String> {
        params["sessionId"]
            .as_str()
            .ok_or("Select a desktop terminal")?
            .strip_prefix(&format!("{}-", self.generation))
            .ok_or("This desktop session expired; reconnect")?
            .parse()
            .map_err(|_| "Invalid session".to_string())
    }
    fn snapshot(&self, params: &Value) -> Result<Value, String> {
        let id = params["sessionId"].as_str().unwrap_or_default();
        let number = self.native_id(params)?;
        let info = self
            .manager
            .list()
            .into_iter()
            .find(|s| s.id == number)
            .ok_or("Terminal closed on the Mac")?;
        let (output, offset, truncated) = self
            .manager
            .remote_snapshot(number)
            .map_err(|e| e.to_string())?;
        // The reply is one encrypted message, and the replay ring holds several
        // messages' worth, so a busy terminal is sent from its most recent end.
        // Marked truncated, the phone starts drawing at a line it can read.
        let shown = frames::tail(&output);
        Ok(
            json!({"sessionId":id,"output":shown,"offset":offset,"truncated":truncated || shown.len() < output.len(),
            "generation":self.generation,"status":if info.alive {"running"} else {"exited"},
            "cols":info.cols,"rows":info.rows}),
        )
    }
}
impl Backend for DesktopBackend {
    fn handle(&self, device: &str, method: &str, params: Value) -> Result<Value, String> {
        if let Some(result) = self.vault.dispatch(method, &params) {
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
                Ok(json!({"protocol":1,
                    "capabilities":{"readOnly":true,"canInput":self.control.typing(),"canManage":self.can_manage(),
                        "scaffoldV1":true},
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
            // Renaming a project, and dropping it from the list. Neither touches
            // the folder itself, so neither is the write that readOnly refuses.
            "project.rename" | "project.forget" => self.manage_project(method, &params),
            // Starting a project is the one thing a phone may make on this Mac.
            // It is not a general write: the plan is the wizard's own, checked
            // before a process runs, and the folder is new by definition.
            method if method.starts_with("scaffold.") => self.scaffolder.handle(method, &params),
            _ => Err("Use Vibyra on your Mac to start or stop terminals and open files.".into()),
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
    }
    fn pairing_notice(&self) -> &'static str {
        if self.vault.project().is_some() {
            "Trust lets this phone view all desktop terminal output, type into those terminals while typing from your phone is on in Settings, read the vault folder you chose in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read anything else on this Mac."
        } else {
            "Trust lets this phone view all desktop terminal output, type into those terminals while typing from your phone is on in Settings, and start a new project — creating its folder and running that stack's own setup. It cannot read your files."
        }
    }
}
