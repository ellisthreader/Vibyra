//! Commit and push as `scaffold::run_step_with` steps: process-group cancel,
//! the stall guard, and Git's own output for the error wording.
use super::git::{base_args, sanitize};
use super::ShipError;
use crate::scaffold::{run_step_with, ScaffoldStep, StepOutcome};
use std::path::Path;
use std::sync::atomic::AtomicBool;

pub(super) fn run(
    root: &Path,
    label: &str,
    args: &[&str],
    cancel: &AtomicBool,
) -> Result<Vec<String>, ShipError> {
    let step = ScaffoldStep {
        label: label.to_owned(),
        program: "git".to_owned(),
        args: base_args()
            .into_iter()
            .chain(args.iter().map(|a| a.to_string()))
            .collect(),
        cwd: root.to_string_lossy().into_owned(),
    };
    let lines = parking_lot::Mutex::new(Vec::<String>::new());
    let keep = |line: String| {
        let mut lines = lines.lock();
        if lines.len() < 200 {
            lines.push(line);
        }
    };
    let outcome = run_step_with(&step, &keep, cancel, &|command| sanitize(command))
        .map_err(|error| ShipError::new(error.to_string()))?;
    let lines = lines.into_inner();
    match outcome {
        StepOutcome::Finished(0) => Ok(lines),
        StepOutcome::Finished(_) => Err(ShipError::from_git(&lines.join("\n"))),
        StepOutcome::Stalled => Err(ShipError::new(
            "Git is waiting for an answer, probably a GitHub sign-in on this computer. Push it yourself from a terminal.",
        )),
        StepOutcome::Cancelled => Err(ShipError::new("Cancelled.")),
    }
}
