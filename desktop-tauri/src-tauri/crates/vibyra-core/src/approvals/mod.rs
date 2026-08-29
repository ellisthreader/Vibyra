//! Authorisation, in one place.
//!
//! Nothing in the UI decides whether an action is allowed. Components render
//! what the broker decided and send back a yes or a no; the policy table lives
//! in `risk`, and the record of what was actually authorised lives in
//! `broker`. That separation is what makes "does Vibyra ask before it spends
//! money" a question with one answer rather than one per screen.

mod broker;
mod fingerprint;
#[cfg(test)]
mod fingerprint_tests;
mod risk;
mod rows;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod trust_tests;

pub use broker::{request, resolve, ApprovalRequest, Outcome, ProposedAction};
pub use fingerprint::fingerprint;
pub use risk::{decide, forbidden, trustable, Decision, Risk};
pub use rows::{invalidate_turn, pending};
