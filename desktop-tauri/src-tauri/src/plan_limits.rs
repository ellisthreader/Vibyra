//! Free and Pro workspace limits, read from the account's `planLimits` block.
//! The server enforces Agents and Vibyra Cloud itself. Terminals and Safe mode
//! worktrees run on this computer, so native commands check them here, at the
//! mutation boundary, and never trust a renderer badge.
#[path = "plan_limits_expiry.rs"]
mod expiry;
use serde::Serialize;
use serde_json::Value;
use vibyra_core::settings::ProjectSpec;

/// Errors carry this marker so the renderer and the phone can show an upgrade
/// prompt instead of a raw failure: `plan-limit:<feature>: <message>`.
pub const MARKER: &str = "plan-limit:";

#[derive(Clone, Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PlanLimits {
    /// False until the server switches limits on; every limit is then open.
    pub enforced: bool,
    pub plan: String,
    /// The account is on its free Pro trial, which ends at `paid_until`.
    pub trial: bool,
    pub paid_until: Option<String>,
    /// Running terminals of any kind, agent or shell. `None` is unlimited.
    pub max_terminals: Option<u32>,
    /// Projects that can be used. Beyond it, projects stay saved but locked.
    pub max_projects: Option<u32>,
    pub safe_worktrees: bool,
    pub preview: bool,
    pub review: bool,
    pub agents: bool,
    pub remote_access: bool,
}

impl Default for PlanLimits {
    /// What an older server that sends no limits gets: nothing is limited.
    fn default() -> Self {
        Self {
            enforced: false,
            plan: "free".into(),
            trial: false,
            paid_until: None,
            max_terminals: None,
            max_projects: None,
            safe_worktrees: true,
            preview: true,
            review: true,
            agents: true,
            remote_access: true,
        }
    }
}

impl PlanLimits {
    /// No verified account yet: the Free workspace, never more.
    pub fn signed_out() -> Self {
        Self {
            enforced: true,
            max_terminals: Some(FREE_TERMINALS),
            max_projects: Some(FREE_PROJECTS),
            safe_worktrees: false,
            preview: false,
            review: false,
            agents: false,
            remote_access: false,
            ..Self::default()
        }
    }

    pub fn from_user(user: &Value) -> Self {
        let block = &user["planLimits"];
        if block["version"].as_u64() != Some(1) {
            return Self::default();
        }
        let open = Self::default();
        let enforced = block["enforced"].as_bool() == Some(true);
        let flag = |key: &str, fallback: bool| {
            if enforced {
                block[key].as_bool().unwrap_or(false)
            } else {
                fallback
            }
        };
        Self {
            enforced,
            plan: block["plan"].as_str().unwrap_or("free").to_owned(),
            trial: block["trial"].as_bool() == Some(true),
            paid_until: block["paidUntil"].as_str().map(str::to_owned),
            // Under enforcement only an explicit null is unlimited; a missing or
            // malformed value is Free's limit, never a wider one.
            max_terminals: if enforced {
                match block.get("maxTerminals") {
                    Some(Value::Null) => None,
                    value => Some(
                        value
                            .and_then(Value::as_u64)
                            .map_or(FREE_TERMINALS, |n| n.clamp(1, 1000) as u32),
                    ),
                }
            } else {
                None
            },
            max_projects: if enforced {
                match block.get("maxProjects") {
                    Some(Value::Null) => None,
                    value => Some(
                        value
                            .and_then(Value::as_u64)
                            .map_or(FREE_PROJECTS, |n| n.clamp(1, 1000) as u32),
                    ),
                }
            } else {
                None
            },
            safe_worktrees: flag("safeWorktrees", open.safe_worktrees),
            preview: flag("preview", open.preview),
            review: flag("review", open.review),
            agents: flag("agents", open.agents),
            remote_access: flag("remoteAccess", open.remote_access),
        }
    }

    /// Whether one more terminal may start while `running` are already running.
    pub fn admit_terminal(&self, running: usize) -> Result<(), String> {
        match self.max_terminals {
            Some(max) if self.enforced && running >= max as usize => Err(format!(
                "{MARKER}terminals: Free runs {max} terminals at once. Close one, or get Vibyra Pro for unlimited terminals."
            )),
            _ => Ok(()),
        }
    }

    /// Whether the project at `position` (0-based, oldest first) can be used.
    /// Projects past the limit stay saved and unlock when Pro returns or an
    /// earlier project is removed.
    pub fn admit_project(&self, position: usize) -> Result<(), String> {
        match self.max_projects {
            Some(max) if self.enforced && position >= max as usize => Err(format!(
                "{MARKER}projects: Free includes {max} {}. Remove one to use this one, or get Vibyra Pro for unlimited projects.",
                if max == 1 { "project" } else { "projects" }
            )),
            _ => Ok(()),
        }
    }

    /// A settings save may keep, reorder or remove projects, but never add one
    /// that would land past the limit.
    pub fn admit_project_list(
        &self,
        current: &[ProjectSpec],
        next: &[ProjectSpec],
    ) -> Result<(), String> {
        for (position, project) in next.iter().enumerate() {
            if !current.iter().any(|existing| existing.id == project.id) {
                self.admit_project(position)?;
            }
        }
        Ok(())
    }

    pub fn admit_preview(&self) -> Result<(), String> {
        if self.enforced && !self.preview {
            Err(format!(
                "{MARKER}preview: Preview is part of Vibyra Pro. Upgrade to run your site beside your agents."
            ))
        } else {
            Ok(())
        }
    }

    pub fn admit_review(&self) -> Result<(), String> {
        if self.enforced && !self.review {
            Err(format!(
                "{MARKER}review: Review is part of Vibyra Pro. Upgrade to check every change before you keep it."
            ))
        } else {
            Ok(())
        }
    }

    pub fn admit_safe_worktrees(&self) -> Result<(), String> {
        if self.enforced && !self.safe_worktrees {
            Err(format!(
                "{MARKER}worktrees: Safe mode worktrees are part of Vibyra Pro. Upgrade to give each agent its own copy."
            ))
        } else {
            Ok(())
        }
    }
}
const FREE_TERMINALS: u32 = 2;
const FREE_PROJECTS: u32 = 1;

#[path = "plan_limits_runtime.rs"]
mod runtime;
pub use runtime::{admit_new_project, current, project_position, running_terminals, setup};

#[cfg(test)]
#[path = "plan_limits_tests.rs"]
mod tests;
