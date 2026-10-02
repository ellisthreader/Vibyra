use std::fs;
use std::path::{Path, PathBuf};

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
    super::seeds::validate(&plan.seeds)?;
    if plan.create_dir {
        fs::create_dir_all(&dir)?;
        apply_seeds(plan)?;
    }
    Ok(plan.steps.iter().map(|step| resolve(step, &dir)).collect())
}

/// Entries that do not make a folder somebody's work. macOS and Windows drop
/// their own into any folder that is merely opened, and a bare `.git` is a
/// repository waiting for a project — very often the one Vibyra itself made on
/// a previous attempt at this very build. Refusing those is how a name becomes
/// unusable forever.
const LEFTOVERS: [&str; 5] = [
    ".git",
    ".DS_Store",
    ".localized",
    "Thumbs.db",
    "desktop.ini",
];

/// Whether a project can be built at this path.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DestinationState {
    /// Nothing there, or nothing that a scaffold would overwrite.
    Free,
    /// Somebody's files are in it.
    Used,
    /// A file sits where the folder would go.
    NotAFolder,
}

pub fn destination_state(dir: &Path) -> DestinationState {
    match fs::read_dir(dir) {
        Ok(entries) => {
            let used = entries
                .flatten()
                .any(|entry| !LEFTOVERS.contains(&entry.file_name().to_string_lossy().as_ref()));
            if used {
                DestinationState::Used
            } else {
                DestinationState::Free
            }
        }
        // Not a directory yet is the normal case; a file in the way is not.
        Err(_) if dir.exists() => DestinationState::NotAFolder,
        Err(_) => DestinationState::Free,
    }
}

/// The first of `base`, `base-2`, `base-3`… whose folder is free, so the wizard
/// never opens with a name that its own build would refuse.
pub fn free_name(parent: &Path, base: &str) -> String {
    if destination_state(&parent.join(base)) == DestinationState::Free {
        return base.to_string();
    }
    (2..500)
        .map(|index| format!("{base}-{index}"))
        .find(|name| destination_state(&parent.join(name)) == DestinationState::Free)
        .unwrap_or_else(|| format!("{base}-{}", std::process::id()))
}

fn check_destination(dir: &Path) -> CoreResult<()> {
    if !dir.is_absolute() {
        return Err(CoreError::InvalidPath(
            "the project folder needs a full path".into(),
        ));
    }
    match destination_state(dir) {
        DestinationState::Free => Ok(()),
        DestinationState::Used => Err(CoreError::InvalidPath(format!(
            "{} already has files in it",
            dir.display()
        ))),
        DestinationState::NotAFolder => Err(CoreError::InvalidPath(format!(
            "{} is a file, not a folder",
            dir.display()
        ))),
    }
}

/// Folder-owning creators run before addon files can be placed in their tree.
pub fn apply_seeds(plan: &ScaffoldPlan) -> CoreResult<()> {
    if !Path::new(&plan.dir).is_dir()
        || (!plan.create_dir && destination_state(Path::new(&plan.dir)) != DestinationState::Used)
    {
        return Err(CoreError::Scaffold(
            "The creator did not create a project folder.".into(),
        ));
    }
    super::seeds::write(Path::new(&plan.dir), &plan.seeds)
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
            .replace(
                "{{venv-bin}}",
                if cfg!(windows) { "Scripts" } else { "bin" },
            )
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
