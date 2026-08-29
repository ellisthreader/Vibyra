//! One agent handing work to another.
//!
//! The structural guarantee, stated once: a handoff **cannot widen the
//! recipient**. Its turn is assembled from the recipient's own profile,
//! places, grants and permission level — the message is only text that arrives
//! in it. There is no code path by which a sentence in a handoff becomes a
//! grant, which is why the guards below can be about cost and loops rather
//! than about authority.

mod allow;
#[cfg(test)]
mod delivery_tests;
mod guards;
mod queries;
mod store;
#[cfg(test)]
mod tests;

pub use allow::{allowlist, set_allowlist};
pub use guards::{needs_approval, refuse, Refusal, SendContext, MAX_CHAIN_MESSAGES, MAX_HOPS};
pub use queries::trail;
pub use store::{attach_chat, send, Delivery, Handoff, MailMessage};
