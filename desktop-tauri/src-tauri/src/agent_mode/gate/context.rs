//! Who is asking, and what they were granted — read at the moment of the
//! question, never cached from the start of the turn.

use vibyra_core::agent_model::{PermissionMode, PlaceAccess};
use vibyra_core::agent_profiles::AgentPlace;

use crate::agent_mode::hub::AgentWorld;

/// The chat's agent as the broker needs to see it.
pub(super) struct Subject {
    pub agent_id: Option<String>,
    pub agent_name: String,
    /// Whether the agent's own level allows writing at all. A turn may have
    /// narrowed this to Plan; that narrowing is already the provider's mode,
    /// so it never proposes a write in the first place.
    pub writes: bool,
    pub places: Vec<AgentPlace>,
}

pub(super) fn load(world: &AgentWorld, chat_id: &str) -> Result<Subject, String> {
    let chat = vibyra_core::agent_chats::get(&world.db, &world.account, chat_id)
        .map_err(|error| error.to_string())?;
    let Some(agent_id) = chat.agent_id.clone() else {
        // Chat Mode: no teammate, so no brief and no standing grants — only
        // the one folder the person mounted, if they did.
        let places = chat
            .mounted_place
            .iter()
            .map(|path| AgentPlace {
                id: "mounted".into(),
                agent_id: String::new(),
                path: path.clone(),
                access: PlaceAccess::ReadWrite,
                label: "mounted folder".into(),
                created_ms: chat.created_ms,
            })
            .collect::<Vec<_>>();
        return Ok(Subject {
            agent_id: None,
            agent_name: "Chat".into(),
            writes: !places.is_empty(),
            places,
        });
    };
    let profile = vibyra_core::agent_profiles::get(&world.db, &world.account, &agent_id)
        .map_err(|error| error.to_string())?;
    let places = vibyra_core::agent_profiles::list_places(&world.db, &agent_id)
        .map_err(|error| error.to_string())?;
    Ok(Subject {
        agent_id: Some(agent_id),
        agent_name: profile.name,
        writes: profile.permission != PermissionMode::Plan,
        places,
    })
}
