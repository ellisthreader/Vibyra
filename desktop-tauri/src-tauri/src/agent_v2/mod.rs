//! Agent V2 Mac runner: runs Agent tasks on the AI account selected in
//! Vibyra, with the Vibyra broker as the provider's only tool source.
//!
//! Contract: `docs/agent-v2-api-contract.md` §6. Adapter:
//! `docs/agent-v2-provider-adapters.md` (Claude Code only; Codex/Gemini
//! register as not ready). Memory: `Vibyra/_ai/Desktop/Agent Backend Rebuild.md`.

pub mod api;
mod attachments;
#[cfg(test)]
mod attachments_support;
pub mod broker;
mod claude_cmd;
pub mod commands;
mod execute;
#[cfg(test)]
pub(crate) mod mock_http;
mod pool;
mod preflight;
mod prompt;
#[cfg(test)]
mod provider_fixture_tests;
mod registration;
mod run;
mod runner;
mod selection;
mod session;
mod session_bound;
mod signin_watch;
mod status;
mod steering_prompt;
mod stream;
mod tools;
mod workspace;
mod workspace_sweep;

pub use runner::spawn;
pub(crate) use session_bound::stop;

/// Hidden CLI mode: `<app> --agent-v2-broker` serves the stdio MCP broker.
pub fn handle_cli() -> Option<Result<&'static str, String>> {
    broker::handle_cli()
}
