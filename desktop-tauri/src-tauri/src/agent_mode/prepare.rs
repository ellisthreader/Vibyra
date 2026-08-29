//! What a turn may reach, and what it is told, resolved at the moment it runs.
//!
//! Read fresh every turn rather than cached on the chat. A place revoked five
//! minutes ago must not still be reachable because the chat was opened before
//! the revocation, and a memory corrected this morning must be the one the
//! agent is given this afternoon.
//!
//! It is also where the two modes differ, and the difference is expressed once
//! here rather than branched on everywhere: a chat with an agent gets that
//! agent's brief, memory, skills and places; a chat without one gets the
//! single folder it was explicitly mounted on, or nothing at all.

use std::sync::Arc;

use vibyra_core::agent_chats::AgentChat;
use vibyra_core::agent_context::{assemble, Occasion};
use vibyra_core::agent_model::PermissionMode;
use vibyra_core::agent_profiles::AgentProfile;

use super::hub::AgentWorld;
use super::turns::TurnRequest;

/// Resolves where this turn may work and what it is told, from the grants in
/// force right now.
///
/// A chat with no agent is Chat Mode: it gets the one folder it was explicitly
/// mounted on, or nothing at all, and no brief, memory or skills. That is the
/// whole difference between the two modes, expressed once.
pub(super) type Prepared = (Vec<String>, String, Option<String>);

pub(super) fn prepare(
    world: &Arc<AgentWorld>,
    chat: &AgentChat,
    profile: Option<&AgentProfile>,
    permission: PermissionMode,
    request: &TurnRequest,
) -> Result<Prepared, String> {
    let Some(profile) = profile else {
        let mounted = chat.mounted_place.clone();
        let cwd = mounted.clone().unwrap_or_else(|| {
            vibyra_core::agent_chats::attachments::folder(&world.root, &chat.id)
                .to_string_lossy()
                .into_owned()
        });
        std::fs::create_dir_all(&cwd).map_err(|error| error.to_string())?;
        return Ok((mounted.into_iter().collect(), cwd, None));
    };

    let db = &world.db;
    let granted = vibyra_core::agent_profiles::list_places(db, &profile.id)
        .map_err(|error| error.to_string())?;
    let memory = vibyra_core::agent_memory::within_budget(db, &profile.id, profile.memory_budget)
        .unwrap_or_default();
    let skills = vibyra_core::skills::assigned(db, &world.account, &profile.id).unwrap_or_default();
    let occasion = match (&request.occasion_routine, &request.occasion_handoff) {
        (Some(name), _) => Occasion::Routine { name },
        (_, Some(from)) => Occasion::Handoff { from },
        _ => Occasion::Direct,
    };
    let context = assemble(
        profile,
        &memory,
        &skills,
        &granted,
        permission,
        occasion,
        &request.prompt,
    );
    let places = vibyra_core::agent_profiles::directory_arguments(&granted, permission.writes());
    // The agent's own home is always where it runs, never the project the user
    // happens to have open. Reaching a granted folder is what `--add-dir` is
    // for; silently starting inside one is how an agent edits the wrong repo.
    std::fs::create_dir_all(&profile.home_path).map_err(|error| error.to_string())?;
    Ok((places, profile.home_path.clone(), Some(context.text)))
}
