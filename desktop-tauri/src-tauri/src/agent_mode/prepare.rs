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
use vibyra_core::agent_context::{assemble, AppliedSkill, Occasion};
use vibyra_core::agent_model::{PermissionMode, PlaceAccess};
use vibyra_core::agent_profiles::{AgentPlace, AgentProfile};

use super::hub::AgentWorld;
use super::turns::TurnRequest;

/// Resolves where this turn may work and what it is told, from the grants in
/// force right now.
///
/// A chat with no agent is Chat Mode: it gets the one folder it was explicitly
/// mounted on, or nothing at all, and no brief, memory or skills. That is the
/// whole difference between the two modes, expressed once.
/// Places, working directory, system prompt, and the skills that shaped it.
///
/// The applied list rides back with the prompt rather than being recomputed
/// later: it is a property of the text that was actually assembled, and
/// re-deriving it would be a second answer to a question already settled.
pub(super) struct Prepared {
    pub places: Vec<AgentPlace>,
    pub cwd: String,
    pub context: String,
    pub fingerprint: String,
    pub applied: Vec<AppliedSkill>,
}

pub(super) fn prepare(
    world: &Arc<AgentWorld>,
    chat: &AgentChat,
    profile: Option<&AgentProfile>,
    permission: PermissionMode,
    request: &TurnRequest,
) -> Result<Prepared, String> {
    let Some(profile) = profile else {
        let mounted = chat.mounted_place.clone();
        let cwd = match mounted.clone() {
            Some(path) => path,
            None => vibyra_core::agent_chats::attachments::folder(&world.root, &chat.id)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .into_owned(),
        };
        std::fs::create_dir_all(&cwd).map_err(|error| error.to_string())?;
        // A detached chat has no agent, so no skills and nothing to declare.
        let places = vec![AgentPlace {
            id: "chat".into(),
            agent_id: String::new(),
            path: cwd.clone(),
            access: if mounted.is_some() {
                PlaceAccess::ReadWrite
            } else {
                PlaceAccess::Read
            },
            label: "Chat workspace".into(),
            created_ms: chat.created_ms,
        }];
        return Ok(Prepared {
            places,
            cwd,
            context: String::new(),
            fingerprint: String::new(),
            applied: Vec::new(),
        });
    };

    let db = &world.db;
    let granted = vibyra_core::agent_profiles::list_places(db, &profile.id)
        .map_err(|error| error.to_string())?;
    let memory = vibyra_core::agent_memory::within_budget(db, &profile.id, profile.memory_budget)
        .map_err(|error| error.to_string())?;
    let skills = vibyra_core::skills::assigned(db, &world.account, &profile.id)
        .map_err(|error| error.to_string())?;
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
    // The agent's own home is always where it runs, never the project the user
    // happens to have open. Reaching a granted folder is what `--add-dir` is
    // for; silently starting inside one is how an agent edits the wrong repo.
    std::fs::create_dir_all(&profile.home_path).map_err(|error| error.to_string())?;
    Ok(Prepared {
        places: granted,
        cwd: profile.home_path.clone(),
        context: context.text,
        fingerprint: context.fingerprint,
        applied: context.applied,
    })
}
