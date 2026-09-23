//! The `scaffold.*` methods themselves, and the handover to the window.
//!
//! Split out of `scaffold.rs` for the 200-line standard. A child module rather
//! than a sibling: `Run`, `Scaffolds` and the run bookkeeping stay private to
//! `scaffold`, and only its descendants can still reach them.

use serde_json::{json, Value};
use std::{
    collections::VecDeque,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use vibyra_core::scaffold::{installed_tools, ScaffoldPlan};

use super::report::execute;
use super::{default_parent, run_id, text, validate, Phase, Run, Scaffolder, KEPT_RUNS};
// Relative rather than `crate::phone::…`: the examples pull this tree in with
// `#[path]`, so there is no `phone` module at their crate root.
use super::super::requests::TerminalRequests;
use super::super::workspace::SharedWorkspace;

impl Scaffolder {
    pub fn new(
        scaffolds: super::SharedScaffolds,
        workspace: SharedWorkspace,
        requests: Arc<TerminalRequests>,
    ) -> Self {
        Self {
            scaffolds,
            workspace,
            requests,
        }
    }

    pub fn handle(&self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "scaffold.preflight" => self.preflight(params),
            "scaffold.start" => self.start(params),
            "scaffold.cancel" => {
                let id = run_id(params)?;
                let scaffolds = self.scaffolds.lock();
                let run = scaffolds.runs.get(id).ok_or("that build is not running")?;
                run.cancel.store(true, Ordering::Relaxed);
                Ok(json!({"ok":true}))
            }
            "scaffold.status" => {
                let id = run_id(params)?;
                let scaffolds = self.scaffolds.lock();
                let run = scaffolds
                    .runs
                    .get(id)
                    .ok_or("that build is not known to this computer")?;
                Ok(run.describe(id))
            }
            "scaffold.adopt" => {
                let dir = text(params, "dir")?.to_owned();
                if !self.scaffolds.lock().targets.contains(&dir) {
                    return Err(
                        "only a folder this computer was asked to build can be opened as a project"
                            .into(),
                    );
                }
                Ok(json!({"project":open_in_window(&self.requests, &dir)?}))
            }
            _ => Err("method not supported by host protocol 1".into()),
        }
    }

    fn preflight(&self, params: &Value) -> Result<Value, String> {
        let tools: Vec<String> = params["tools"]
            .as_array()
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default();
        if tools.len() > 32
            || tools.iter().any(|tool| {
                tool.is_empty()
                    || tool.len() > 32
                    || !tool
                        .chars()
                        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
            })
        {
            return Err("tools are plain executable names".into());
        }
        let home = dirs::home_dir().ok_or("this computer has no home folder")?;
        let roots = self.workspace.read().roots();
        Ok(
            json!({"tools":installed_tools(&tools),"home":home,"parent":default_parent(&roots,&home)}),
        )
    }

    fn start(&self, params: &Value) -> Result<Value, String> {
        let id = run_id(params)?.to_owned();
        let plan: ScaffoldPlan = serde_json::from_value(params["plan"].clone())
            .map_err(|_| "the plan is not one this computer understands")?;
        validate(&plan)?;
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut scaffolds = self.scaffolds.lock();
            // A retried start for a build already under way is the same build,
            // not a second one: the phone is told its id and hears the rest on
            // the stream it is already listening to.
            if scaffolds
                .runs
                .get(&id)
                .is_some_and(|run| run.phase == Phase::Running)
            {
                return Ok(json!({"runId":id}));
            }
            if scaffolds
                .runs
                .values()
                .any(|run| run.phase == Phase::Running)
            {
                return Err("another project is still being built on this computer".into());
            }
            while scaffolds.order.len() >= KEPT_RUNS {
                if let Some(old) = scaffolds.order.pop_front() {
                    scaffolds.runs.remove(&old);
                }
            }
            scaffolds.order.retain(|kept| kept != &id);
            scaffolds.order.push_back(id.clone());
            scaffolds.targets.insert(plan.dir.clone());
            scaffolds.runs.insert(
                id.clone(),
                Run {
                    dir: plan.dir.clone(),
                    phase: Phase::Running,
                    progress: None,
                    lines: VecDeque::new(),
                    error: None,
                    project: None,
                    cancel: cancel.clone(),
                },
            );
        }
        let scaffolds = self.scaffolds.clone();
        let requests = self.requests.clone();
        let thread = id.clone();
        std::thread::Builder::new()
            .name("vibyra-scaffold".into())
            .spawn(move || execute(scaffolds, requests, thread, plan, cancel))
            .map_err(|e| format!("could not start the build: {e}"))?;
        Ok(json!({"runId":id}))
    }
}

/// Asks the window to open the folder as one of its projects and hands back
/// the project it added. The window owns the list, so this is the only way a
/// folder built here becomes one the phone can see.
pub(super) fn open_in_window(requests: &Arc<TerminalRequests>, dir: &str) -> Result<Value, String> {
    let name = Path::new(dir)
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("Project");
    let project = requests.ask(json!({"action":"adopt","path":dir,"name":name}))?;
    if project["id"].as_str().is_none_or(str::is_empty) {
        return Err(crate::platform_text::for_computer(
            "Vibyra on your Mac did not open the new folder.",
            "Vibyra on your computer did not open the new folder.",
        )
        .into());
    }
    Ok(project)
}
