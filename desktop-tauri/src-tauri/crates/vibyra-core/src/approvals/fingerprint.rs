//! The digest that stops an approved action from being swapped.
//!
//! Its own file because it has its own threat model. The cheap FNV hash the
//! terminal prompt scanner uses is fine there — it is only ever compared
//! against itself, to notice that a screen changed. This one guards a spend,
//! where a collision *is* the attack, so it is SHA-256 and every field that
//! could alter the effect is inside it.
//!
//! It is the second line of defence, not the first. The first is that the
//! executor performs the *stored* row rather than asking the agent again what
//! it wanted, so a forged token buys nothing on its own.

use sha2::{Digest, Sha256};

use super::broker::ProposedAction;

/// The digest over everything that makes this action *this* action.
///
/// Every field that could change the effect is in it. Anything omitted here is
/// a field an agent could alter after approval without the card noticing.
pub fn fingerprint(proposed: &ProposedAction) -> String {
    let mut hasher = Sha256::new();
    for part in [
        proposed.action.as_str(),
        proposed.target.as_str(),
        proposed.detail.as_str(),
        proposed.risk.as_str(),
        proposed.chat_id.as_deref().unwrap_or(""),
        proposed.turn_id.as_deref().unwrap_or(""),
        proposed.agent_id.as_deref().unwrap_or(""),
    ] {
        // Length-prefixed so ("ab","c") and ("a","bc") are different actions
        // rather than the same stream of bytes.
        hasher.update((part.len() as u64).to_le_bytes());
        hasher.update(part.as_bytes());
    }
    hasher.update(proposed.cost_usd.unwrap_or(0.0).to_bits().to_le_bytes());
    format!("{:x}", hasher.finalize())
}
