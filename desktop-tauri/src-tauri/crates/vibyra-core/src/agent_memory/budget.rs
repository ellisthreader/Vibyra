//! Choosing what fits in a prompt.
//!
//! The distinction this file exists to hold: the budget shapes the *prompt*,
//! never the store. Everything that does not fit stays exactly where it was —
//! still listed, still searchable, still correctable — it simply is not
//! injected this turn. That is what keeps "my agent has too much context" from
//! turning into "my agent forgot".

use crate::agentdb::AgentDb;
use crate::error::CoreResult;

use super::record::{MemoryEntry, MemoryStatus};
use super::store::list;

/// The active entries that fit in `budget` characters, highest rank first.
///
/// The budget shapes the *prompt*, never the store. Everything that does not
/// fit stays exactly where it was, still listed, still searchable, still
/// correctable — it simply is not injected this turn. That distinction is what
/// keeps "my agent has too much context" from becoming "my agent forgot".
pub fn within_budget(db: &AgentDb, agent_id: &str, budget: i64) -> CoreResult<Vec<MemoryEntry>> {
    let mut active: Vec<MemoryEntry> = list(db, agent_id)?
        .into_iter()
        .filter(|entry| entry.status == MemoryStatus::Active)
        .collect();
    active.sort_by(|left, right| {
        right
            .rank()
            .cmp(&left.rank())
            .then(right.updated_ms.cmp(&left.updated_ms))
    });

    let mut used = 0i64;
    let mut chosen = Vec::new();
    for entry in active {
        let cost = entry.body.chars().count() as i64 + 2;
        // A pinned entry is the user's override on the budget and is taken
        // whatever the running total says; everything else has to fit.
        if entry.pinned || used + cost <= budget {
            used += cost;
            chosen.push(entry);
        }
    }
    Ok(chosen)
}

/// Active entries whose text overlaps a proposal enough to be about the same
/// thing. Used by reflection to spot a contradiction before it commits one.
pub fn overlapping(db: &AgentDb, agent_id: &str, body: &str) -> CoreResult<Vec<MemoryEntry>> {
    let words = super::reflect::significant_words(body);
    Ok(list(db, agent_id)?
        .into_iter()
        .filter(|entry| entry.status == MemoryStatus::Active)
        .filter(|entry| super::reflect::overlaps(&words, &entry.body))
        .collect())
}
