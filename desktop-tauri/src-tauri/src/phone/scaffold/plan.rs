//! What a phone is allowed to ask this Mac to build, and where it goes.
//!
//! Split out of `scaffold.rs` for the 200-line standard. These two are the
//! rules, with no state and no threads behind them, which is also what makes
//! them the part `scaffold_tests.rs` exercises directly.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use vibyra_core::scaffold::ScaffoldPlan;

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
