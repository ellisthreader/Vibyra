//! Starting a project from the phone on a Mac running Vibyra itself.
//!
//! The standalone Host answers the same `scaffold.*` methods, and the phone's
//! wizard cannot tell the two apart: the plan it sends is the one the desktop
//! wizard builds, and `vibyra_core::scaffold` runs it here exactly as it runs
//! it there. What differs is the ending. The Host owns the folders it shares,
//! so it adopts the new one itself; this adapter owns no project list at all —
//! the window publishes it — so the built folder is handed to the window to
//! open, the way a phone's terminal request is handed to it.
//!
//! A build runs on its own thread and reports as `scaffold.step`,
//! `scaffold.output` and `scaffold.done`. Nothing here waits on a process
//! inside a request: that would hold the connection's event pump with it.

use super::requests::TerminalRequests;
use super::workspace::SharedWorkspace;
use parking_lot::Mutex;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::{Duration, Instant},
};
use vibyra_core::scaffold::{
    git_init, installed_tools, prepare, run_step, ScaffoldPlan, StepOutcome,
};

const LINE_TAIL: usize = 200;
const KEPT_RUNS: usize = 8;
const BATCH_LINES: usize = 40;
const BATCH_WINDOW: Duration = Duration::from_millis(120);
/// The live stream drains this on its tick, so events wait here in between. A
/// package manager printing faster than the tick is bounded rather than left
/// to grow: the oldest lines go, and the phone's own log keeps the tail.
const OUTBOX_CAP: usize = 512;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
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

pub struct Run {
    dir: String,
    phase: Phase,
    progress: Option<Value>,
    lines: VecDeque<String>,
    error: Option<String>,
    project: Option<Value>,
    cancel: Arc<AtomicBool>,
}
impl Run {
    fn push_line(&mut self, line: String) {
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
pub struct Scaffolds {
    runs: HashMap<String, Run>,
    order: VecDeque<String>,
    /// Folders a run was asked to build in. Only these may be opened as they
    /// stand, so a phone cannot name an arbitrary folder and have the window
    /// add it as a project.
    targets: HashSet<String>,
    outbox: VecDeque<Value>,
}
impl Scaffolds {
    fn emit(&mut self, event: &str, data: Value) {
        if self.outbox.len() >= OUTBOX_CAP {
            self.outbox.pop_front();
        }
        self.outbox.push_back(json!({"event":event,"data":data}));
    }
    /// Everything queued since the stream last looked.
    pub fn drain(&mut self) -> Vec<Value> {
        self.outbox.drain(..).collect()
    }
}
pub type SharedScaffolds = Arc<Mutex<Scaffolds>>;

fn text<'a>(params: &'a Value, key: &str) -> Result<&'a str, String> {
    params[key]
        .as_str()
        .ok_or_else(|| format!("{key} is missing"))
}

fn run_id(params: &Value) -> Result<&str, String> {
    let id = text(params, "runId")?;
    if id.is_empty() || id.len() > 64 || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("runId must be 1–64 letters, digits or dashes".into());
    }
    Ok(id)
}

/// Refuses anything the wizard could not have produced, before a process runs.
/// Steps are argv without a shell, so a project name can never become a
/// command; programs are bare tool names or live inside the new folder; every
/// cwd is the folder or its parent. Kept identical to the Host's rules — the
/// phone sends one plan and must not find one computer laxer than the other.
pub fn validate(plan: &ScaffoldPlan) -> Result<(), String> {
    let dir = Path::new(&plan.dir);
    if plan.dir.len() > 1024 || plan.dir.chars().any(char::is_control) || !dir.is_absolute() {
        return Err("the project folder needs a full path".into());
    }
    let parent = dir
        .parent()
        .filter(|parent| parent.parent().is_some())
        .ok_or("choose a folder inside another folder")?;
    if plan.steps.len() > 12 || plan.seeds.len() > 32 {
        return Err("this template asks for too much".into());
    }
    for step in &plan.steps {
        let bare = !step.program.contains(['/', '\\']);
        let inside = step.program.starts_with("{{venv}}/") || step.program.starts_with("{{dir}}/");
        if step.program.is_empty()
            || step.program.len() > 256
            || !(bare || inside)
            || step.program.chars().any(char::is_control)
        {
            return Err(format!(
                "{} is not a tool this computer can be asked to run",
                step.program
            ));
        }
        if step.label.len() > 80
            || step.args.len() > 64
            || step
                .args
                .iter()
                .any(|arg| arg.len() > 512 || arg.contains('\0'))
        {
            return Err("a step in this template is malformed".into());
        }
        let cwd = Path::new(&step.cwd);
        if cwd != dir && cwd != parent {
            return Err("steps may only run in the new folder or beside it".into());
        }
    }
    for seed in &plan.seeds {
        if seed.path.len() > 256 || seed.body.len() > 64 * 1024 {
            return Err("a starter file in this template is too large".into());
        }
    }
    Ok(())
}

/// Where new projects go: beside most of the ones the window is showing, else
/// ~/Projects. A project sitting directly in the home folder is not counted —
/// it would put every new project loose in `~`.
pub fn default_parent(projects: &[PathBuf], home: &Path) -> PathBuf {
    let mut counts: HashMap<&Path, usize> = HashMap::new();
    for project in projects {
        if let Some(parent) = project.parent() {
            if parent != home && parent.parent().is_some() {
                *counts.entry(parent).or_default() += 1;
            }
        }
    }
    counts
        .into_iter()
        .max_by_key(|(parent, count)| (*count, std::cmp::Reverse(parent.to_path_buf())))
        .map(|(parent, _)| parent.to_path_buf())
        .unwrap_or_else(|| home.join("Projects"))
}

/// The `scaffold.*` half of the desktop adapter.
pub struct Scaffolder {
    scaffolds: SharedScaffolds,
    workspace: SharedWorkspace,
    requests: Arc<TerminalRequests>,
}

impl Scaffolder {
    pub fn new(
        scaffolds: SharedScaffolds,
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
fn open_in_window(requests: &Arc<TerminalRequests>, dir: &str) -> Result<Value, String> {
    let name = Path::new(dir)
        .file_name()
        .and_then(|part| part.to_str())
        .unwrap_or("Project");
    let project = requests.ask(json!({"action":"adopt","path":dir,"name":name}))?;
    if project["id"].as_str().is_none_or(str::is_empty) {
        return Err("Vibyra on your Mac did not open the new folder.".into());
    }
    Ok(project)
}

struct Reporter {
    scaffolds: SharedScaffolds,
    run_id: String,
    pending: Mutex<(Vec<String>, Instant)>,
}
impl Reporter {
    fn step(&self, index: usize, total: usize, label: &str) {
        self.flush();
        let progress = json!({"index":index,"total":total,"label":label});
        let mut scaffolds = self.scaffolds.lock();
        if let Some(run) = scaffolds.runs.get_mut(&self.run_id) {
            run.progress = Some(progress);
        }
        scaffolds.emit(
            "scaffold.step",
            json!({"runId":self.run_id,"index":index,"total":total,"label":label}),
        );
    }
    fn line(&self, line: String) {
        if let Some(run) = self.scaffolds.lock().runs.get_mut(&self.run_id) {
            run.push_line(line.clone());
        }
        let mut pending = self.pending.lock();
        pending.0.push(line);
        let due = pending.0.len() >= BATCH_LINES || pending.1.elapsed() >= BATCH_WINDOW;
        if !due {
            return;
        }
        let lines = std::mem::take(&mut pending.0);
        pending.1 = Instant::now();
        drop(pending);
        self.scaffolds
            .lock()
            .emit("scaffold.output", json!({"runId":self.run_id,"lines":lines}));
    }
    fn flush(&self) {
        let lines = {
            let mut pending = self.pending.lock();
            pending.1 = Instant::now();
            std::mem::take(&mut pending.0)
        };
        if !lines.is_empty() {
            self.scaffolds
                .lock()
                .emit("scaffold.output", json!({"runId":self.run_id,"lines":lines}));
        }
    }
    fn finish(&self, phase: Phase, error: Option<String>, project: Option<Value>) {
        self.flush();
        let mut scaffolds = self.scaffolds.lock();
        if let Some(run) = scaffolds.runs.get_mut(&self.run_id) {
            run.phase = phase;
            run.progress = None;
            run.error = error.clone();
            run.project = project.clone();
        }
        // The folder list changes first, so a phone that refreshes on it already
        // holds the new project when the outcome arrives.
        if phase == Phase::Done {
            scaffolds.emit("host.changed", json!({}));
        }
        scaffolds.emit(
            "scaffold.done",
            json!({"runId":self.run_id,"ok":phase == Phase::Done,
            "message":error,"stalled":phase == Phase::Stalled,"project":project}),
        );
    }
}

fn execute(
    scaffolds: SharedScaffolds,
    requests: Arc<TerminalRequests>,
    run_id: String,
    plan: ScaffoldPlan,
    cancel: Arc<AtomicBool>,
) {
    let reporter = Reporter {
        scaffolds,
        run_id,
        pending: Mutex::new((Vec::new(), Instant::now())),
    };
    let steps = match prepare(&plan) {
        Ok(steps) => steps,
        Err(error) => return reporter.finish(Phase::Failed, Some(error.to_string()), None),
    };
    let total = steps.len();
    for (index, step) in steps.iter().enumerate() {
        reporter.step(index, total, &step.label);
        let emit = |line: String| reporter.line(line);
        match run_step(step, &emit, &cancel) {
            Ok(StepOutcome::Finished(0)) => {}
            Ok(StepOutcome::Finished(code)) => {
                return reporter.finish(
                    Phase::Failed,
                    Some(format!("{} stopped with exit code {code}.", step.label)),
                    None,
                );
            }
            Ok(StepOutcome::Stalled) => {
                return reporter.finish(
                    Phase::Stalled,
                    Some(format!("{} is waiting for an answer.", step.label)),
                    None,
                );
            }
            Ok(StepOutcome::Cancelled) => {
                return reporter.finish(Phase::Cancelled, Some("Cancelled.".into()), None)
            }
            Err(error) => return reporter.finish(Phase::Failed, Some(error.to_string()), None),
        }
    }
    if plan.git_init && !git_init(&plan.dir) {
        reporter.line("git init did not run — the project is fine without it.".into());
    }
    // Built. The window is asked to open it, and only then is it a project the
    // phone can enter; a window that is closed leaves the folder on disk and
    // says so, which is what the wizard's "open it as it stands" is for.
    match open_in_window(&requests, &plan.dir) {
        Ok(project) => reporter.finish(Phase::Done, None, Some(project)),
        Err(error) => reporter.finish(
            Phase::Failed,
            Some(format!("The project was built but is not open yet: {error}")),
            None,
        ),
    }
}
