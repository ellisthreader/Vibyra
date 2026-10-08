//! Starting a project from the phone: the same plan the desktop wizard builds,
//! run on this computer by `vibyra_core::scaffold`, reported back as events.
//! A run is started and answered at once; the work happens on its own thread
//! and reaches the phone as `scaffold.step`, `scaffold.output` and
//! `scaffold.done`. A request that blocked for the whole build would hold the
//! connection's event pump with it, so nothing here waits on a process.
use crate::{state::Shared, text, Engine};
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{atomic::AtomicBool, atomic::Ordering, Arc},
};
use vibyra_core::scaffold::{installed_tools, ScaffoldPlan};
pub(crate) const LINE_TAIL: usize = 200;
const KEPT_RUNS: usize = 8;
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum Phase {
    Running,
    Done,
    Failed,
    Stalled,
    Cancelled,
}
impl Phase {
    fn name(self) -> &'static str {
        match self {
            Phase::Running => "running",
            Phase::Done => "done",
            Phase::Failed => "failed",
            Phase::Stalled => "stalled",
            Phase::Cancelled => "cancelled",
        }
    }
}
pub(crate) struct Run {
    pub dir: String,
    pub phase: Phase,
    pub progress: Option<Value>,
    pub lines: VecDeque<String>,
    pub error: Option<String>,
    pub project: Option<Value>,
    pub cancel: Arc<AtomicBool>,
}
impl Run {
    pub fn push_line(&mut self, line: String) {
        if self.lines.len() == LINE_TAIL {
            self.lines.pop_front();
        }
        self.lines.push_back(line);
    }
    fn describe(&self, run_id: &str) -> Value {
        json!({"runId":run_id,"dir":self.dir,"phase":self.phase.name(),"progress":self.progress,
            "lines":self.lines,"error":self.error,"project":self.project})
    }
}
#[derive(Default)]
pub(crate) struct Scaffolds {
    pub runs: HashMap<String, Run>,
    pub order: VecDeque<String>,
    /// Folders a run was asked to build in. Only these may be adopted as they
    /// stand, so a phone cannot register an arbitrary folder as a project.
    pub targets: HashSet<String>,
}
pub(crate) type SharedScaffolds = Arc<Mutex<Scaffolds>>;
fn run_id(params: &Value) -> Result<&str, String> {
    let id = text(params, "runId")?;
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
    {
        return Err("runId must be 1–64 letters, digits or dashes".into());
    }
    Ok(id)
}
#[path = "scaffold_plan.rs"]
mod plan;
pub(crate) use plan::{default_parent, validate};
impl Engine {
    pub(crate) fn scaffold_handle(&self, method: &str, params: &Value) -> Result<Value, String> {
        match method {
            "scaffold.preflight" => self.scaffold_preflight(params),
            "scaffold.start" => self.scaffold_start(params),
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
                let dir = text(params, "dir")?;
                if !self.scaffolds.lock().targets.contains(dir) {
                    return Err(
                        "only a folder this computer was asked to build can be opened as a project"
                            .into(),
                    );
                }
                let project = self.shared.lock().adopt_project(Path::new(dir))?;
                self.shared.lock().emit("host.changed", json!({}));
                Ok(json!({"project":project}))
            }
            _ => Err("method not supported by host protocol 1".into()),
        }
    }
    fn scaffold_preflight(&self, params: &Value) -> Result<Value, String> {
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
        let roots: Vec<PathBuf> = self
            .shared
            .lock()
            .projects
            .iter()
            .map(|p| p.path.clone())
            .collect();
        Ok(
            json!({"tools":installed_tools(&tools),"home":home,"parent":default_parent(&roots, &home)}),
        )
    }
    fn scaffold_start(&self, params: &Value) -> Result<Value, String> {
        let id = run_id(params)?.to_owned();
        let plan: ScaffoldPlan = serde_json::from_value(params["plan"].clone())
            .map_err(|_| "the plan is not one this computer understands")?;
        validate(&plan)?;
        let cancel = Arc::new(AtomicBool::new(false));
        {
            let mut scaffolds = self.scaffolds.lock();
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
        let (shared, scaffolds): (Shared, SharedScaffolds) =
            (self.shared.clone(), self.scaffolds.clone());
        let thread = id.clone();
        std::thread::Builder::new()
            .name("vibyra-scaffold".into())
            .spawn(move || crate::scaffold_run::execute(shared, scaffolds, thread, plan, cancel))
            .map_err(|e| format!("could not start the build: {e}"))?;
        Ok(json!({"runId":id}))
    }
}
