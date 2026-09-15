use std::fs;
use std::path::{Component, Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::{CoreError, CoreResult};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldSeed {
    pub path: String,
    pub body: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldStep {
    pub label: String,
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScaffoldPlan {
    pub dir: String,
    pub create_dir: bool,
    pub seeds: Vec<ScaffoldSeed>,
    pub steps: Vec<ScaffoldStep>,
    pub git_init: bool,
}

/// Validates the destination, creates what has to exist, writes the seeds, and
/// hands back the steps with their platform tokens resolved. Anything that can
/// be refused is refused here, before a single process is spawned.
pub fn prepare(plan: &ScaffoldPlan) -> CoreResult<Vec<ScaffoldStep>> {
    let dir = PathBuf::from(&plan.dir);
    check_destination(&dir)?;
    let parent = dir
        .parent()
        .ok_or_else(|| CoreError::InvalidPath("choose a folder inside another folder".into()))?;
    fs::create_dir_all(parent)?;
    if plan.create_dir || !plan.seeds.is_empty() {
        fs::create_dir_all(&dir)?;
    }
    for seed in &plan.seeds {
        write_seed(&dir, seed)?;
    }
    Ok(plan.steps.iter().map(|step| resolve(step, &dir)).collect())
}

fn check_destination(dir: &Path) -> CoreResult<()> {
    if !dir.is_absolute() {
        return Err(CoreError::InvalidPath(
            "the project folder needs a full path".into(),
        ));
    }
    match fs::read_dir(dir) {
        Ok(mut entries) => {
            if entries.next().is_some() {
                Err(CoreError::InvalidPath(format!(
                    "{} already has files in it",
                    dir.display()
                )))
            } else {
                Ok(())
            }
        }
        // Not a directory yet is the normal case; a file in the way is not.
        Err(_) if dir.exists() => Err(CoreError::InvalidPath(format!(
            "{} is a file, not a folder",
            dir.display()
        ))),
        Err(_) => Ok(()),
    }
}

/// Seeds are written by us, so their paths are ours — but a template is data,
/// and data that walks out of the project folder would be a way to write
/// anywhere on disk.
fn write_seed(dir: &Path, seed: &ScaffoldSeed) -> CoreResult<()> {
    let relative = Path::new(&seed.path);
    let safe = relative
        .components()
        .all(|component| matches!(component, Component::Normal(_)));
    if !safe {
        return Err(CoreError::InvalidPath(format!(
            "{} is not a path inside the project",
            seed.path
        )));
    }
    let target = dir.join(relative);
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(target, &seed.body)?;
    Ok(())
}

/// `{{dir}}` and `{{venv}}` are resolved here rather than in the renderer,
/// because only this side knows where a virtual environment puts its binaries.
fn resolve(step: &ScaffoldStep, dir: &Path) -> ScaffoldStep {
    let dir_text = dir.to_string_lossy().into_owned();
    let venv = venv_bin(dir);
    let fill = |value: &str| {
        value
            .replace("{{dir}}", &dir_text)
            .replace("{{venv}}", &venv)
    };
    ScaffoldStep {
        label: step.label.clone(),
        program: fill(&step.program),
        args: step.args.iter().map(|arg| fill(arg)).collect(),
        cwd: fill(&step.cwd),
    }
}

fn venv_bin(dir: &Path) -> String {
    let leaf = if cfg!(windows) { "Scripts" } else { "bin" };
    dir.join(".venv").join(leaf).to_string_lossy().into_owned()
}
