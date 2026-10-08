//! Local (stdio) MCP servers the person runs on this Mac.
//!
//! Vibyra Agent teammates never get a server's command line or environment: the
//! Mac keeps the definition (`spec`, `store`), starts the process on demand
//! (`supervisor`), speaks MCP to it (`conn`, `handshake`, `tools`) and only ever
//! reports the tool catalogue and call results to the backend. The model sees
//! these tools through the broker like any other tool, never directly.
//!
//! Protocol: dual era. `server/discover` first (2026-07-28, stateless, `_meta` on
//! every request); anything else, or silence, falls back to `initialize`
//! (2024-11-05 .. 2025-11-25). A small custom client rather than `rmcp`: this
//! crate is synchronous and runtime-free, and the bounds that matter here (line
//! cap, process-group kill, clean environment) are ours either way.

mod conn;
pub mod env;
mod error;
pub mod guard;
mod handshake;
mod idle;
mod launch;
mod limits;
mod redact;
mod rpc;
mod slot;
pub mod spec;
pub mod store;
mod supervisor;
mod tools;
mod wire;

pub use conn::Era;
pub use error::McpError;
pub use limits::{Limits, MAX_SERVERS, MAX_TOOLS, RESULT_TEXT_BYTES};
pub use slot::{State, Status};
pub use spec::{forbidden_env, ServerSpec};
pub use supervisor::{SecretSource, Supervisor};
pub use tools::{CallResult, ToolDef};

#[cfg(test)]
mod tests_guard;
#[cfg(test)]
mod tests_lifecycle;
#[cfg(test)]
mod tests_protocol;
#[cfg(test)]
mod tests_real;
#[cfg(test)]
mod tests_safety;
#[cfg(test)]
mod tests_spec;
#[cfg(test)]
mod tests_support;
