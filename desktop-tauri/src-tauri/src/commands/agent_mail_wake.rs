//! Waking a recipient into the chat a handoff creates.
//!
//! Split from the send command because two callers need it: a handoff that
//! was allowed outright, and one that a person approved in Decisions minutes
//! later. Both must produce exactly the same thing — a fresh chat, the same
//! occasion line, the same authority — so there is one of it.

use std::sync::Arc;

use vibyra_core::agent_mail::MailMessage;
use vibyra_core::agent_model::ChatSource;

use crate::agent_mode::turns::{execute, TurnRequest};

/// Opens the recipient's fresh chat and runs the handoff in it.
///
/// A fresh chat every time, never an existing one: a handoff arriving in the
/// middle of a conversation the user was having would rewrite that
/// conversation's subject without asking.
pub fn wake(
    world: &Arc<crate::agent_mode::AgentWorld>,
    recipient: &vibyra_core::agent_profiles::AgentProfile,
    message: &MailMessage,
) -> Result<String, String> {
    let chat = vibyra_core::agent_chats::create(
        &world.db,
        &world.account,
        vibyra_core::agent_chats::NewChat {
            agent_id: Some(recipient.id.clone()),
            engine: recipient.engine,
            title: String::new(),
            source: ChatSource::Handoff,
        },
    )
    .map_err(|e| e.to_string())?;
    let _ = vibyra_core::agent_mail::attach_chat(&world.db, &message.id, &chat.id);

    let world = Arc::clone(world);
    let request = TurnRequest {
        chat_id: chat.id.clone(),
        prompt: message.body.clone(),
        permission: None,
        occasion_routine: None,
        occasion_handoff: Some(message.sender_name.clone()),
        account_id: None,
    };
    std::thread::spawn(move || {
        let _ = execute(&world, request, |_| {});
    });
    Ok(chat.id)
}
