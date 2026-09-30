use super::control::Control;
use super::frames;
use super::railway::RailwayCli;
use super::requests::TerminalRequests;
use super::scaffold::{Scaffolder, Scaffolds, SharedScaffolds};
use super::vault::Vault;
use super::workspace::{SharedWorkspace, UNFILED};
use serde_json::{json, Value};
use std::sync::{atomic::AtomicBool, Arc};
use vibyra_core::pty::PtyManager;
use vibyra_host::PreviewHandler;

pub(crate) trait PreviewControl: PreviewHandler {
    fn list(&self, device: &str) -> Value;
    fn start(&self, device: &str, grant_id: &str) -> Result<Value, String>;
    fn open(&self, device: &str, grant_id: &str) -> Result<Value, String>;
}

pub struct DesktopBackend {
    pub(super) manager: Arc<PtyManager>,
    pub(super) workspace: SharedWorkspace,
    pub(super) control: Control,
    typing: Arc<AtomicBool>,
    generation: String,
    vault: Arc<Vault>,
    railway: Arc<RailwayCli>,
    railway_tools: super::railway_tools::RailwayTools,
    pub(super) requests: Arc<TerminalRequests>,
    pub(super) scaffolds: SharedScaffolds,
    scaffolder: Scaffolder,
    pub(super) preview: Option<Arc<dyn PreviewControl>>,
}
impl DesktopBackend {
    /// `typing` is the Mac's switch for letting phones type; it is read on
    /// every claim and keystroke, so flipping it takes effect at once.
    #[allow(dead_code)] // Existing tests and standalone diagnostic examples use this constructor.
    pub fn new(
        manager: Arc<PtyManager>,
        workspace: SharedWorkspace,
        typing: Arc<AtomicBool>,
        vault: Arc<Vault>,
        requests: Arc<TerminalRequests>,
    ) -> Result<Self, String> {
        Self::new_with_preview(manager, workspace, typing, vault, requests, None)
    }

    pub fn new_with_preview(
        manager: Arc<PtyManager>,
        workspace: SharedWorkspace,
        typing: Arc<AtomicBool>,
        vault: Arc<Vault>,
        requests: Arc<TerminalRequests>,
        preview: Option<Arc<dyn PreviewControl>>,
    ) -> Result<Self, String> {
        let mut bytes = [0u8; 16];
        getrandom::fill(&mut bytes).map_err(|e| e.to_string())?;
        let generation = bytes.iter().map(|b| format!("{b:02x}")).collect();
        let scaffolds: SharedScaffolds = Arc::new(parking_lot::Mutex::new(Scaffolds::default()));
        let scaffolder = Scaffolder::new(scaffolds.clone(), workspace.clone(), requests.clone());
        let railway = RailwayCli::start();
        let railway_tools = super::railway_tools::RailwayTools::new(vault.state_dir());
        Ok(Self {
            manager,
            workspace,
            control: Control::new(typing.clone()),
            typing,
            generation,
            vault,
            railway,
            railway_tools,
            requests,
            scaffolds,
            scaffolder,
            preview,
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
            Some(_) => Err(crate::platform_text::for_computer(
                "This terminal has stopped on the Mac",
                "This terminal has stopped on the computer",
            )
            .into()),
            None => Err(crate::platform_text::for_computer(
                "Terminal closed on the Mac",
                "Terminal closed on the computer",
            )
            .into()),
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
            .ok_or(crate::platform_text::for_computer(
                "Terminal closed on the Mac",
                "Terminal closed on the computer",
            ))?;
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
/// The wire protocol — every method the phone can call — lives next door, so
/// both halves stay inside the 200-line standard.
///
/// The path is spelled out because `examples/phone_typing_probe.rs` pulls this
/// file in with `#[path]`, and a module reached that way resolves its children
/// against the including file's directory, not its own.
#[path = "backend/protocol.rs"]
mod protocol;
