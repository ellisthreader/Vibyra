//! The immutable run scope intersected with current revocations.
use crate::agent_mode::hub::AgentWorld;
use vibyra_core::agent_model::{PermissionMode, PlaceAccess};
use vibyra_core::agent_profiles::AgentPlace;

pub(super) struct Subject {
    pub agent_id: Option<String>,
    pub agent_name: String,
    pub writes: bool,
    pub places: Vec<AgentPlace>,
    pub cwd: String,
    pub context_fingerprint: String,
}

pub(super) fn load(world: &AgentWorld, chat_id: &str, turn_id: &str) -> Result<Subject, String> {
    let chat = vibyra_core::agent_chats::get(&world.db, &world.account, chat_id)
        .map_err(|e| e.to_string())?;
    let run = vibyra_core::agent_runs::get(&world.db, &world.account, turn_id)
        .map_err(|e| e.to_string())?;
    if run.chat_id != chat_id || !run.status.active() || world.is_cancelled(chat_id) {
        return Err("This task is no longer active.".into());
    }
    let mut writes = run.spec.permission.writes();
    let current = if let Some(id) = &chat.agent_id {
        let profile = vibyra_core::agent_profiles::get(&world.db, &world.account, id)
            .map_err(|e| e.to_string())?;
        if profile.archived_ms.is_some() {
            return Err("This teammate is archived.".into());
        }
        writes &= profile.permission != PermissionMode::Plan;
        vibyra_core::agent_profiles::list_places(&world.db, id).map_err(|e| e.to_string())?
    } else {
        writes &= chat.mounted_place.is_some();
        run.spec
            .places
            .iter()
            .filter(|p| {
                chat.mounted_place.as_ref() == Some(&p.path)
                    || (!writes && p.access == PlaceAccess::Read)
            })
            .cloned()
            .collect()
    };
    let places = run
        .spec
        .places
        .iter()
        .filter_map(|old| {
            if old.id == "attachments" {
                let folder =
                    vibyra_core::agent_chats::attachments::folder(&world.root, chat_id).ok()?;
                if std::path::Path::new(&old.path) == folder && old.access == PlaceAccess::Read {
                    return Some(old.clone());
                }
                return None;
            }
            let live = current.iter().find(|p| p.path == old.path)?;
            let mut place = old.clone();
            if live.access == PlaceAccess::Read {
                place.access = PlaceAccess::Read;
            }
            Some(place)
        })
        .collect();
    Ok(Subject {
        agent_id: chat.agent_id,
        agent_name: run.spec.agent_name,
        writes,
        places,
        cwd: run.spec.cwd,
        context_fingerprint: run.spec.context_fingerprint,
    })
}
