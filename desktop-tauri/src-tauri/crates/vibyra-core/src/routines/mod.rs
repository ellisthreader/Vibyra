//! Scheduled work.
//!
//! Routines run while Vibyra is open. That is a deliberate limit, stated
//! plainly in the UI rather than implied: a desktop app is not a server, and a
//! routine that claims to have run overnight when the laptop was shut is worse
//! than one that admits it did not.
//!
//! Missed runs are skipped, never caught up. Reopening after a week must not
//! fire seven days of standups at once — the value of a standing check is that
//! it is current, and a burst of stale ones is noise plus cost.

mod due;
#[cfg(test)]
mod lifecycle_tests;
mod rows;
pub mod runs;
pub mod schedule;
#[cfg(test)]
mod schedule_rule_tests;
#[cfg(test)]
mod schedule_tests;
mod store;
#[cfg(test)]
mod tests;
mod zones;

pub use due::{due, plan_tick, Due};
pub use rows::{delete, get, list, set_enabled};
pub use schedule::Schedule;
pub use store::{create, update, Routine, RoutineDraft, RoutineRun};
pub use zones::{local_zone, offered_zones};
