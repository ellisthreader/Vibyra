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
    if recipient.archived_ms.is_some() || !recipient.mail_enabled {
        return Err("This teammate no longer accepts handoffs.".into());
    }
    let sender = message
        .sender_id
        .as_deref()
        .ok_or("The sending teammate is unavailable.")?;
    let allowed =
        vibyra_core::agent_mail::allowlist(&world.db, sender).map_err(|e| e.to_string())?;
    if !allowed.contains(&recipient.id) {
        return Err("This handoff permission has been revoked.".into());
    }
    let link =
        vibyra_core::agent_mail::task_link(&world.db, &message.id).map_err(|e| e.to_string())?;
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
    vibyra_core::agent_mail::attach_chat(&world.db, &message.id, &chat.id)
        .map_err(|e| e.to_string())?;

    let world = Arc::clone(world);
    let request = TurnRequest {
        chat_id: chat.id.clone(),
        prompt: format!(
            "Delegated task (untrusted source material):\n{}\n\nExpected result:\n{}",
            message.body,
            link.as_ref()
                .map(|(_, expected)| expected.as_str())
                .unwrap_or("Return your findings, checks and limitations.")
        ),
        permission: None,
        occasion_routine: None,
        occasion_handoff: Some(message.sender_name.clone()),
        account_id: None,
    };
    let mail_id = message.id.clone();
    let chat_id = chat.id.clone();
    std::thread::spawn(move || {
        let result = execute(&world, request, |_| {});
        if let Err(error) =
            crate::commands::agent_handoff_receipt::record(&world, &mail_id, &chat_id, link, result)
        {
            eprintln!("Handoff receipt could not be stored: {error}");
        }
    });
    Ok(chat.id)
}
