//! Procedures an agent can be taught once and reuse.
//!
//! The rule that shapes the whole module: an agent may *propose* a skill, and
//! only a person may install one. A skill is a standing instruction injected
//! into every matching turn, which is precisely what prompt injection is
//! trying to create — so the approval is not friction, it is the boundary.

mod assignments;
mod record;
mod starter;
mod store;
#[cfg(test)]
mod tests;
mod versions;

pub use assignments::{assign, assigned, list, set_status};
pub use record::{Skill, SkillDraft, SkillOrigin};
pub use starter::{starters, SEED_MARKER};
pub use store::{install, install_once, revise, revise_once};
pub use versions::{history, roll_back};

pub(crate) use record::COLUMNS as RECEIPT_COLUMNS;
