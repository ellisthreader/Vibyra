//! What a persistent teammate is.
//!
//! Deliberately *not* `AgentSpec`, which already means something in this crate
//! — a launchable CLI runtime, the thing a terminal pane runs. An `AgentProfile`
//! is a person-shaped thing the user names and comes back to; it *chooses* an
//! engine rather than being one. Keeping the two words apart is the whole
//! reason this type has a different name.

use serde::{Deserialize, Serialize};

use crate::agent_model::{Engine, PermissionMode, Reflection};
use crate::agentdb::sql;
use crate::error::CoreResult;

/// A named teammate, as stored and as the UI sees it.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentProfile {
    pub id: String,
    pub account: String,
    pub name: String,
    /// Responsibility, context, quality bar and stop boundary, in the user's
    /// own words. Injected ahead of every turn in every chat this agent owns.
    pub brief: String,
    pub engine: Engine,
    pub model: Option<String>,
    pub effort: Option<String>,
    pub permission: PermissionMode,
    /// Characters of ranked memory allowed into a prompt. Not a cap on what is
    /// *stored*: overflow stays searchable, it just ranks out of the turn.
    pub memory_budget: i64,
    pub reflection: Reflection,
    /// The private folder Vibyra gives every agent, always granted, never the
    /// user's project unless they say so.
    pub home_path: String,
    pub accent: String,
    pub mail_enabled: bool,
    pub routines_allowed: bool,
    pub created_ms: i64,
    pub updated_ms: i64,
    pub archived_ms: Option<i64>,
}

/// The columns every read of a profile selects, in the order `from_row` wants.
pub const COLUMNS: &str = "id, account, name, brief, engine, model, effort, permission, \
     memory_budget, reflection, home_path, accent, mail_enabled, routines_allowed, \
     created_ms, updated_ms, archived_ms";

impl AgentProfile {
    pub fn from_row(row: &rusqlite::Row<'_>) -> CoreResult<Self> {
        let engine: String = row.get(4).map_err(sql)?;
        let permission: String = row.get(7).map_err(sql)?;
        let reflection: String = row.get(9).map_err(sql)?;
        Ok(Self {
            id: row.get(0).map_err(sql)?,
            account: row.get(1).map_err(sql)?,
            name: row.get(2).map_err(sql)?,
            brief: row.get(3).map_err(sql)?,
            engine: Engine::parse(&engine),
            model: row.get(5).map_err(sql)?,
            effort: row.get(6).map_err(sql)?,
            permission: PermissionMode::parse(&permission),
            memory_budget: row.get(8).map_err(sql)?,
            reflection: Reflection::parse(&reflection),
            home_path: row.get(10).map_err(sql)?,
            accent: row.get(11).map_err(sql)?,
            mail_enabled: row.get::<_, i64>(12).map_err(sql)? != 0,
            routines_allowed: row.get::<_, i64>(13).map_err(sql)? != 0,
            created_ms: row.get(14).map_err(sql)?,
            updated_ms: row.get(15).map_err(sql)?,
            archived_ms: row.get(16).map_err(sql)?,
        })
    }
}

/// The fields `New Agent` collects. Everything else has a strong default and
/// is changed later in the agent's own settings, which is why creation is one
/// short form rather than a wizard.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewAgent {
    pub name: String,
    #[serde(default)]
    pub brief: String,
    pub engine: Engine,
}

/// A change to an existing profile. Every field is optional and `None` means
/// "leave it alone", so the UI can save one row of a settings pane without
/// having to send back the whole agent and risk clobbering a concurrent edit.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentUpdate {
    pub name: Option<String>,
    pub brief: Option<String>,
    pub model: Option<Option<String>>,
    pub effort: Option<Option<String>>,
    pub permission: Option<PermissionMode>,
    pub memory_budget: Option<i64>,
    pub reflection: Option<Reflection>,
    pub accent: Option<String>,
    pub mail_enabled: Option<bool>,
    pub routines_allowed: Option<bool>,
}

/// Applies the change in memory. Kept beside the type rather than written as
/// a pile of conditional `UPDATE`s so there is one place that says what a
/// partial update means.
impl AgentUpdate {
    pub fn apply(self, profile: &mut AgentProfile) {
        if let Some(name) = self.name {
            profile.name = name;
        }
        if let Some(brief) = self.brief {
            profile.brief = brief;
        }
        if let Some(model) = self.model {
            profile.model = model;
        }
        if let Some(effort) = self.effort {
            profile.effort = effort;
        }
        if let Some(permission) = self.permission {
            profile.permission = permission;
        }
        if let Some(budget) = self.memory_budget {
            profile.memory_budget = budget.clamp(0, 64_000);
        }
        if let Some(reflection) = self.reflection {
            profile.reflection = reflection;
        }
        if let Some(accent) = self.accent {
            profile.accent = accent;
        }
        if let Some(mail) = self.mail_enabled {
            profile.mail_enabled = mail;
        }
        if let Some(routines) = self.routines_allowed {
            profile.routines_allowed = routines;
        }
    }
}
