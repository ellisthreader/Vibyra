//! A skill: a procedure an agent can be taught once and reuse.
//!
//! The shape is opinionated because a vague skill is worse than none. Four
//! fields are required and each answers a different question:
//!
//! * **Trigger** — when this applies. Narrow, or it fires on everything.
//! * **Procedure** — what to do.
//! * **Verification** — how to know it worked. Without this a skill is a
//!   habit, and a habit that half-works is indistinguishable from one that
//!   works until someone checks.
//! * **Boundary** — where to stop and ask.
//!
//! An agent may *propose* a skill after doing the same work twice. It may
//! never install one. The user approves, because a skill is a standing
//! instruction and a standing instruction the user never read is exactly the
//! thing prompt injection is trying to create.

use serde::{Deserialize, Serialize};

use crate::agentdb::sql;
use crate::error::CoreResult;

/// Who wrote it. Shown on the card, and the reason an agent-authored skill
/// arrives as a proposal rather than as an installation.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SkillOrigin {
    /// Shipped with Vibyra.
    Starter,
    /// Written by the user.
    User,
    /// Proposed by an agent, pending approval.
    Agent,
}

impl SkillOrigin {
    pub fn as_str(self) -> &'static str {
        match self {
            SkillOrigin::Starter => "starter",
            SkillOrigin::User => "user",
            SkillOrigin::Agent => "agent",
        }
    }

    pub fn parse(value: &str) -> Self {
        match value {
            "starter" => SkillOrigin::Starter,
            "agent" => SkillOrigin::Agent,
            _ => SkillOrigin::User,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
    pub id: String,
    pub account: String,
    pub name: String,
    pub summary: String,
    /// Bumped on every edit. A version is what makes rollback possible and
    /// what lets an old turn's audit record still say which text ran.
    pub version: i64,
    pub trigger: String,
    pub procedure: String,
    pub verification: String,
    pub boundary: String,
    pub origin: SkillOrigin,
    /// `installed` or `proposed`. A proposal is never injected.
    pub status: String,
    pub created_ms: i64,
    pub updated_ms: i64,
}

pub const COLUMNS: &str = "id, account, name, summary, version, trigger, procedure, \
     verification, boundary, origin, status, created_ms, updated_ms";

impl Skill {
    pub fn from_row(row: &rusqlite::Row<'_>) -> CoreResult<Self> {
        let origin: String = row.get(9).map_err(sql)?;
        Ok(Self {
            id: row.get(0).map_err(sql)?,
            account: row.get(1).map_err(sql)?,
            name: row.get(2).map_err(sql)?,
            summary: row.get(3).map_err(sql)?,
            version: row.get(4).map_err(sql)?,
            trigger: row.get(5).map_err(sql)?,
            procedure: row.get(6).map_err(sql)?,
            verification: row.get(7).map_err(sql)?,
            boundary: row.get(8).map_err(sql)?,
            origin: SkillOrigin::parse(&origin),
            status: row.get(10).map_err(sql)?,
            created_ms: row.get(11).map_err(sql)?,
            updated_ms: row.get(12).map_err(sql)?,
        })
    }

    /// The one line that goes in every turn's context.
    ///
    /// Only the name, trigger and summary — the procedure is expanded solely
    /// for skills whose trigger matched, because injecting six full procedures
    /// into every prompt is how a memory budget gets spent on instructions
    /// nobody needed.
    pub fn headline(&self) -> String {
        format!(
            "- {} — {} (use when: {})",
            self.name, self.summary, self.trigger
        )
    }

    /// The full text, for a skill that applies to this turn.
    pub fn expanded(&self) -> String {
        let mut text = format!(
            "### {} (v{})\n{}\n",
            self.name, self.version, self.procedure
        );
        if !self.verification.trim().is_empty() {
            text.push_str(&format!("Check it worked: {}\n", self.verification));
        }
        if !self.boundary.trim().is_empty() {
            text.push_str(&format!("Stop and ask before: {}\n", self.boundary));
        }
        text
    }
}

/// A skill as written or proposed.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillDraft {
    pub name: String,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub trigger: String,
    #[serde(default)]
    pub procedure: String,
    #[serde(default)]
    pub verification: String,
    #[serde(default)]
    pub boundary: String,
}
