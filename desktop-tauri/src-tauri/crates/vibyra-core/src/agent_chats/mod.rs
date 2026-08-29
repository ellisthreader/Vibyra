//! Conversations: the roster of them, and the transcript inside each.
//!
//! One table holds both an agent's chats and Chat Mode's detached ones,
//! because to the runtime they are the same thing — a session id, an engine
//! and an ordered event log. What differs is authority, and that is a nullable
//! `agent_id` plus an optional mounted place, not a second implementation.

#[cfg(test)]
mod attachment_tests;
pub mod attachments;
#[cfg(test)]
mod detached_tests;
mod edits;
mod record;
mod search;
mod store;
#[cfg(test)]
mod tests;
pub mod transcript;

pub use attachments::ChatAttachment;
pub use edits::{amend, mount_place};
pub use record::{AgentChat, ChatEventRow};
pub use search::search;
pub use store::{bind_session, create, delete, get, list, reset_running, set_state, NewChat};
