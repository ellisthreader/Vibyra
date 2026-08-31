//! Vibyra Desktop native core.
//!
//! Everything performance-critical lives here, with no UI-toolkit
//! dependencies: PTY session management, output batching/throttling,
//! the AI-agent registry, filesystem services and settings persistence.
//! The Tauri shell crate is a thin adapter over this API, which keeps the
//! core compilable and testable on machines without webkit/GTK and reusable
//! if the shell ever changes.

pub mod agent_chats;
pub mod agent_context;
pub mod agent_mail;
pub mod agent_memory;
pub mod agent_model;
pub mod agent_profiles;
pub mod agent_runtime;
pub mod agentdb;
pub mod agents;
pub mod approvals;
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
pub mod routines;
pub mod settings;
pub mod skills;
pub mod utf8;
pub mod workspace;
pub mod workspace_preflight;
pub mod workspace_ref;

pub use error::{CoreError, CoreResult};
