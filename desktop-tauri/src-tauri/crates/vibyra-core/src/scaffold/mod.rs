//! Creating a project folder and running the stack's own scaffolder in it.
//!
//! Three rules shape everything here:
//!
//! * **Nothing is overwritten.** A destination that already holds files is
//!   refused before a process starts, and a failed run leaves what it made.
//! * **No shell.** Steps are argv, so a project name can never become a
//!   command. Tokens are substituted here, not interpolated into a string.
//! * **No TTY.** Every catalogued step is non-interactive; a step that stops
//!   to ask a question is caught by the stall guard in `run` rather than
//!   hanging forever.

mod plan;
mod preflight;
mod run;
#[cfg(test)]
mod tests;

pub use plan::{prepare, ScaffoldPlan, ScaffoldSeed, ScaffoldStep};
pub use preflight::installed_tools;
pub use run::{git_init, run_step, StepOutcome};
