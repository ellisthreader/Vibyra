//! Commands for agent-to-agent handoffs.
//!
//! The send path does three things the core cannot do on its own: it reads the
//! app-wide pause out of settings, it looks up the recipient's name and
//! willingness, and — when a handoff is allowed — it opens the fresh chat the
//! recipient wakes into and runs that turn on its own thread.
//!
//! What it deliberately does *not* do is pass anything from the message into
//! the recipient's authority. The recipient's turn is assembled from the
//! recipient's own profile; a handoff is text that arrives inside it.

use std::sync::Arc;

use tauri::State;
use vibyra_core::agent_mail::{Delivery, Handoff, MailMessage};
use vibyra_core::agent_model::ChatSource;

use super::agent_roster::world;
use super::run_blocking;
use crate::agent_mode::turns::{execute, TurnRequest};
use crate::state::AppState;

/// What happened to a handoff, in terms the transcript can render.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HandoffResult {
    pub status: String,
    /// The sentence to show. A refusal's own words, or a note that it landed.
    pub message: String,
    pub chat_id: Option<String>,
}

#[tauri::command]
pub async fn agent_mail_send(
    state: State<'_, AppState>,
    handoff: Handoff,
) -> Result<HandoffResult, String> {
    let world = world(&state)?;
    let paused = state.settings.lock().agent_mail_paused;
    let recipient =
        vibyra_core::agent_profiles::get(&world.db, &world.account, &handoff.recipient_id)
            .map_err(|e| e.to_string())?;

    let delivery = run_blocking({
        let world = Arc::clone(&world);
        let handoff = handoff.clone();
        let name = recipient.name.clone();
        let accepts = recipient.mail_enabled;
        move || {
            vibyra_core::agent_mail::send(&world.db, paused, handoff, &name, accepts)
                .map_err(|e| e.to_string())
        }
    })
    .await?;

    match delivery {
        Delivery::Refused(refusal) => Ok(HandoffResult {
            status: "refused".into(),
            message: refusal.message(),
            chat_id: None,
        }),
        Delivery::NeedsApproval { message, phrase } => Ok(HandoffResult {
            status: "awaitingApproval".into(),
            message: format!(
                "That handoff asks {} to “{phrase}”, which needs your approval. \
                 It is waiting in Decisions rather than running.",
                recipient.name
            ),
            chat_id: message.chat_id,
        }),
        Delivery::Delivered(message) => {
            let chat_id = wake(&world, &recipient, &message)?;
            Ok(HandoffResult {
                status: "delivered".into(),
                message: format!("Handed to {} in a new chat.", recipient.name),
                chat_id: Some(chat_id),
            })
        }
    }
}

/// Opens the recipient's fresh chat and runs the handoff in it.
///
/// A fresh chat every time, never an existing one: a handoff arriving in the
/// middle of a conversation the user was having would rewrite that
/// conversation's subject without asking.
fn wake(
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

#[tauri::command]
pub async fn agent_mail_trail(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<Vec<MailMessage>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_mail::trail(&world.db, &agent_id, 100).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_mail_allowlist(
    state: State<'_, AppState>,
    agent_id: String,
) -> Result<Vec<String>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_mail::allowlist(&world.db, &agent_id).map_err(|e| e.to_string())
    })
    .await
}

#[tauri::command]
pub async fn agent_mail_set_allowlist(
    state: State<'_, AppState>,
    agent_id: String,
    peers: Vec<String>,
) -> Result<(), String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::agent_mail::set_allowlist(&world.db, &agent_id, &peers)
            .map_err(|e| e.to_string())
    })
    .await
}
