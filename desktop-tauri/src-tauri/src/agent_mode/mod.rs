//! Agent Mode's native half.
//!
//! The shell crate's job here is thin on purpose: `vibyra-core` owns the
//! database, the adapters, the schedule arithmetic and every policy decision,
//! and this module owns the things that need a running application — an
//! account to be scoped to, a Tauri handle to emit on, and threads to run on.
//!
//! `hub` is the boundary that matters. One account's world is open at a time,
//! and closing it stops every provider process, which is what makes Vibyra's
//! sign-out promise true for Agent Mode too.

mod env;
pub mod hub;
mod prepare;
mod probe;
mod reflect;
pub mod scheduler;
mod title;
pub mod turns;

pub use hub::{AgentHub, AgentWorld};
pub use probe::probe_engines;
