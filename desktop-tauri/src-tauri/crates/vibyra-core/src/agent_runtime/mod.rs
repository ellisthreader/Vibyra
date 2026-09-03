//! Running structured chats: the adapters, the process supervisor, and the
//! one event vocabulary everything above them reads.
//!
//! Kept apart from `pty`, which is the other execution path. That one owns
//! long-lived terminals whose value is the screen; this one owns short-lived
//! processes whose value is their stdout, parsed as JSON. They share nothing
//! but the environment sanitiser, and neither should grow to look like the
//! other.

pub mod adapter;
pub mod capabilities;
pub mod claude;
mod claude_events;
#[cfg(test)]
mod claude_input_tests;
#[cfg(test)]
mod claude_tests;
pub mod codex;
mod codex_events;
#[cfg(test)]
mod codex_tests;
pub mod events;
mod events_bounds;
#[cfg(test)]
mod events_wire_tests;
#[cfg(test)]
#[path = "platform_import_scan.rs"]
mod platform_import_scan;
#[cfg(test)]
#[path = "platform_import_tests.rs"]
mod platform_import_tests;
pub mod process;
mod process_io;
mod process_kill;
#[cfg(test)]
mod process_tests;
#[cfg(test)]
mod tests;

pub use adapter::{normalize, PlannedTurn, TurnPlan};
pub use capabilities::EngineCapabilities;
pub use claude::PermissionBridge;
pub use events::{AgentEvent, TurnOccasion};
pub use process::{run, TurnCommand, TurnExit, TurnHandle};
