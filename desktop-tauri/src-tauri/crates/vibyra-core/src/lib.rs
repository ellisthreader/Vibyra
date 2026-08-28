//! Vibyra Desktop native core.
//!
//! Everything performance-critical lives here, with no UI-toolkit
//! dependencies: PTY session management, output batching/throttling,
//! the AI-agent registry, filesystem services and settings persistence.
//! The Tauri shell crate is a thin adapter over this API, which keeps the
//! core compilable and testable on machines without webkit/GTK and reusable
//! if the shell ever changes.

pub mod agents;
pub mod error;
pub mod fsx;
pub mod github;
pub mod launch_env;
pub mod memory;
pub mod notifications;
pub mod parallel;
pub mod preview;
pub mod project_activity;
pub mod pty;
pub mod review;
pub mod ring;
pub mod settings;
pub mod utf8;
pub mod workspace;
pub mod workspace_preflight;
pub mod workspace_ref;

pub use error::{CoreError, CoreResult};
