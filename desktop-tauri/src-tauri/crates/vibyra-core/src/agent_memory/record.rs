//! What an agent remembers, and the two things memory is not.
//!
//! It is **not the transcript**. A chat holds what was said; memory holds what
//! turned out to be durably true, and survives the chat being deleted.
//!
//! It is **not a cache of secrets**. Nothing that looks like a credential is
//! ever stored, whoever proposed it — see `redacts_secrets`. A model that
//! helpfully "remembers" an API key has created a plaintext credential store
//! with a search box, and no budget or approval flow makes that acceptable.

use serde::{Deserialize, Serialize};

use crate::agentdb::sql;
use crate::error::CoreResult;

/// What kind of durable thing this is. Drives ranking, not storage: a
/// constraint outranks a preference when the budget is tight, because being
/// wrong about a constraint is the more expensive mistake.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MemoryClass {
    /// How this person likes to work.
    Preference,
    /// Something true about the product or codebase.
    Fact,
    /// A choice that was made and should not be relitigated.
    Decision,
    /// A rule that keeps applying.
    Constraint,
    /// Something that went wrong once and should not again.
    Lesson,
}

impl MemoryClass {
    pub fn as_str(self) -> &'static str {
        match self {
            MemoryClass::Preference => "preference",
            MemoryClass::Fact => "fact",
            MemoryClass::Decision => "decision",
            MemoryClass::Constraint => "constraint",
            MemoryClass::Lesson => "lesson",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "preference" => MemoryClass::Preference,
            "decision" => MemoryClass::Decision,
            "constraint" => MemoryClass::Constraint,
            "lesson" => MemoryClass::Lesson,
            _ => MemoryClass::Fact,
        }
    }

    /// The tiebreak when the budget cannot hold everything.
    pub fn weight(self) -> i64 {
        match self {
            MemoryClass::Constraint => 40,
            MemoryClass::Decision => 30,
            MemoryClass::Lesson => 20,
            MemoryClass::Preference => 15,
            MemoryClass::Fact => 10,
        }
    }
}

/// Where an entry stands.
///
/// `Proposed` is the whole point of Suggest mode: the agent noticed something,
/// and the user has not agreed yet. It is stored — so the user can find it —
/// and never injected.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MemoryStatus {
    Proposed,
    Active,
    /// Kept and searchable, deliberately out of the prompt.
    Archived,
    /// The user said no. Kept so the same thing is not proposed forever.
    Rejected,
}

impl MemoryStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            MemoryStatus::Proposed => "proposed",
            MemoryStatus::Active => "active",
            MemoryStatus::Archived => "archived",
            MemoryStatus::Rejected => "rejected",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "proposed" => MemoryStatus::Proposed,
            "archived" => MemoryStatus::Archived,
            "rejected" => MemoryStatus::Rejected,
            _ => MemoryStatus::Active,
        }
    }
}

/// One durable thing an agent knows.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MemoryEntry {
    pub id: String,
    pub agent_id: String,
    pub class: MemoryClass,
    pub body: String,
    pub priority: i64,
    /// Pinned entries are injected first and are never ranked out. The user's
    /// override on the budget, and the reason a budget is not a delete.
    pub pinned: bool,
    pub status: MemoryStatus,
    /// Which chat and turn this came from. Provenance is what makes a wrong
    /// memory correctable rather than merely deletable.
    pub source_chat: Option<String>,
    pub source_turn: Option<String>,
    pub created_ms: i64,
    pub updated_ms: i64,
}

pub const COLUMNS: &str = "id, agent_id, class, body, priority, pinned, status, \
     source_chat, source_turn, created_ms, updated_ms";

impl MemoryEntry {
    pub fn from_row(row: &rusqlite::Row<'_>) -> CoreResult<Self> {
        let class: String = row.get(2).map_err(sql)?;
        let status: String = row.get(6).map_err(sql)?;
        Ok(Self {
            id: row.get(0).map_err(sql)?,
            agent_id: row.get(1).map_err(sql)?,
            class: MemoryClass::parse(&class),
            body: row.get(3).map_err(sql)?,
            priority: row.get(4).map_err(sql)?,
            pinned: row.get::<_, i64>(5).map_err(sql)? != 0,
            status: MemoryStatus::parse(&status),
            source_chat: row.get(7).map_err(sql)?,
            source_turn: row.get(8).map_err(sql)?,
            created_ms: row.get(9).map_err(sql)?,
            updated_ms: row.get(10).map_err(sql)?,
        })
    }

    /// The score the budget ranks by. Pinned entries sit above everything,
    /// then explicit priority, then class weight, so a hand-raised preference
    /// still beats an automatic fact.
    pub fn rank(&self) -> i64 {
        (self.pinned as i64) * 1_000_000 + self.priority * 100 + self.class.weight()
    }
}
