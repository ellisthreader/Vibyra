//! Authorisation, in one place.
//!
//! Nothing in the UI decides whether an action is allowed. Components render
//! what the broker decided and send back a yes or a no; the policy table lives
//! in `risk`, and the record of what was actually authorised lives in
//! `broker`. That separation is what makes "does Vibyra ask before it spends
//! money" a question with one answer rather than one per screen.
//!
//! `classify` is the newest entrance: a provider's own permission prompt,
//! turned into a proposed action the same broker judges.

mod broker;
mod classify;
#[cfg(test)]
mod classify_tests;
mod fingerprint;
#[cfg(test)]
mod fingerprint_tests;
#[cfg(test)]
mod orphan_tests;
mod risk;
mod rows;
#[cfg(test)]
mod shell_hole_tests;
mod shell_risk;
#[cfg(test)]
mod tests;
#[cfg(test)]
mod trust_tests;

pub use broker::{request, resolve, ApprovalRequest, Outcome, ProposedAction};
pub use classify::{classify, escalation_risk, file_target, Classified};
pub use fingerprint::fingerprint;
pub use risk::{decide, forbidden, trustable, Decision, Risk};
pub use rows::{expire, get, invalidate_orphans, invalidate_turn, pending};
pub use shell_risk::bash_risk;
