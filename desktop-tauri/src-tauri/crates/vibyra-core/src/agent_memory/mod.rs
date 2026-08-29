//! What an agent knows between conversations.
//!
//! Distinct from `crate::memory`, which is the *project's* notes and the
//! user's connected Obsidian vaults — documents a person wrote, browsed and
//! searched. This is the agent's own ledger: short durable statements it
//! learned, each with provenance, each correctable, ranked into a budget
//! before every turn.
//!
//! The two meet only where the user explicitly says so; project memory is
//! never silently global context for a teammate.

mod budget;
mod record;
pub mod reflect;
mod secrets;
mod store;
#[cfg(test)]
mod store_tests;
#[cfg(test)]
mod tests;

pub use budget::{overlapping, within_budget};
pub use record::{MemoryClass, MemoryEntry, MemoryStatus};
pub use reflect::{judge, Verdict};
pub use secrets::looks_like_a_secret;
pub use store::{amend, delete, list, record, set_status, NewMemory};
