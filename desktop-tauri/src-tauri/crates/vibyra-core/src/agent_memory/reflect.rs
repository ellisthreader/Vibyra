//! Whether a proposed memory may commit itself.
//!
//! Automatic reflection is the setting most likely to go wrong quietly, so the
//! rule is narrow and stated once here rather than spread across the caller:
//!
//! * **Off** — nothing is extracted at all.
//! * **Suggest** — everything waits for the user.
//! * **Automatic** — only *low-risk* entries commit. A proposal that
//!   contradicts something already known, that carries anything secret-shaped,
//!   or that changes a rule rather than adding a detail, still waits.
//!
//! The asymmetry is deliberate. An agent quietly adding "the deploy script is
//! `scripts/ship.sh`" costs nothing if it is wrong. An agent quietly deciding
//! "the user prefers force-pushing to main" is a rule it will keep acting on,
//! and the user finds out by watching it happen.

use crate::agent_model::Reflection;

use super::record::{MemoryClass, MemoryEntry, MemoryStatus};

/// What reflection decided about one proposal.
#[derive(Debug, Clone, PartialEq)]
pub enum Verdict {
    /// Not extracted at all — reflection is off.
    Discarded,
    /// Stored as a proposal, waiting for the user.
    Proposed(String),
    /// Stored active. Only reachable in Automatic mode, and only for a
    /// proposal that clears every guard below.
    Committed,
}

impl Verdict {
    pub fn status(&self) -> Option<MemoryStatus> {
        match self {
            Verdict::Discarded => None,
            Verdict::Proposed(_) => Some(MemoryStatus::Proposed),
            Verdict::Committed => Some(MemoryStatus::Active),
        }
    }
}

/// Decides the fate of one proposed entry.
///
/// `existing` is the set of active entries that overlap it — the contradiction
/// check needs to see what is already known, and the caller has already looked
/// it up for the same reason.
pub fn judge(
    mode: Reflection,
    class: MemoryClass,
    body: &str,
    existing: &[MemoryEntry],
) -> Verdict {
    if mode == Reflection::Off {
        return Verdict::Discarded;
    }
    if mode == Reflection::Suggest {
        return Verdict::Proposed("Suggest mode: every entry waits for you.".into());
    }
    if super::secrets::looks_like_a_secret(body) {
        return Verdict::Proposed("It looks like it carries a credential.".into());
    }
    if !low_risk(class) {
        return Verdict::Proposed(format!(
            "A {} is a rule the agent will keep acting on.",
            class.as_str()
        ));
    }
    if let Some(clash) = existing.first() {
        return Verdict::Proposed(format!(
            "It overlaps something already known: “{}”.",
            clash.body.chars().take(80).collect::<String>()
        ));
    }
    Verdict::Committed
}

/// Which classes are cheap to be wrong about.
///
/// Facts and lessons describe; constraints, decisions and preferences
/// prescribe. Only the describing half commits on its own.
fn low_risk(class: MemoryClass) -> bool {
    matches!(class, MemoryClass::Fact | MemoryClass::Lesson)
}

/// The words worth comparing two entries by: long enough to carry meaning,
/// and not the scaffolding every sentence has.
pub fn significant_words(text: &str) -> Vec<String> {
    const NOISE: &[&str] = &[
        "the", "and", "for", "with", "that", "this", "from", "into", "when", "than", "then",
        "should", "always", "never", "must", "does", "have", "been", "which", "there", "their",
        "about", "using", "use",
    ];
    text.to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|word| word.len() > 3 && !NOISE.contains(word))
        .map(str::to_string)
        .collect()
}

/// Whether two entries are about the same thing.
///
/// A share of significant words rather than a similarity score: the job is to
/// notice "these two sentences are about the deploy script" and hand it to a
/// person, not to decide which of them is right.
pub fn overlaps(words: &[String], other: &str) -> bool {
    if words.is_empty() {
        return false;
    }
    let theirs = significant_words(other);
    if theirs.is_empty() {
        return false;
    }
    let shared = words.iter().filter(|word| theirs.contains(word)).count();
    shared * 2 >= words.len().min(theirs.len())
}

#[cfg(test)]
#[path = "reflect_tests.rs"]
mod tests;
