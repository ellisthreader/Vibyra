//! The teammate roster: reading it, changing it, and the folders each one owns.
//!
//! Every function here takes an `account`, and every query filters on it. That
//! is not decoration — Vibyra's account boundary is the reason signing out can
//! reload the window and know nothing leaked, and a roster query that forgot
//! its scope would be the hole in it.

mod place_store;
mod places;
mod record;
mod store;
#[cfg(test)]
mod tests;

pub use place_store::{grant_place, list_places, revoke_place, routines_allowed};
pub use places::{authorize, canonical_place, directory_arguments, within, AgentPlace};
pub use record::{AgentProfile, AgentUpdate, NewAgent};
pub use store::{archive, create, delete, get, list, update};

use std::path::{Path, PathBuf};

use crate::error::{CoreError, CoreResult};

/// The private folder an agent is given at creation.
///
/// Every agent has somewhere it can work without being handed a folder of the
/// user's, which is what makes "no places granted" a usable state rather than
/// an agent that cannot write a scratch file. It is created owner-only and is
/// always the agent's first read/write place.
pub fn home_for(root: &Path, agent_id: &str) -> CoreResult<PathBuf> {
    let home = root.join("agents").join(agent_id);
    std::fs::create_dir_all(&home)?;
    crate::fsx::harden_dir(&home);
    std::fs::canonicalize(&home)
        .map_err(|error| CoreError::InvalidPath(format!("agent home {}: {error}", home.display())))
}

/// Trims and bounds a user-supplied agent name.
///
/// A name reaches a window title, a notification and a mention (`@name`), so
/// it may not be empty and may not carry newlines that would let one line of
/// text look like two.
pub fn clean_name(name: &str) -> CoreResult<String> {
    let cleaned: String = name
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .collect::<String>()
        .trim()
        .to_string();
    if cleaned.is_empty() {
        return Err(CoreError::Settings("an agent needs a name".into()));
    }
    Ok(cleaned.chars().take(60).collect())
}
