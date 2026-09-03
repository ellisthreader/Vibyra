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

use tauri::{AppHandle, Emitter, State};
use vibyra_core::agent_mail::{Delivery, Handoff, MailMessage};
use vibyra_core::agent_model::PermissionMode;
use vibyra_core::approvals::{self, Outcome, ProposedAction};

use super::agent_roster::world;
use super::run_blocking;
use crate::state::AppState;

#[path = "agent_mail_wake.rs"]
mod wake_mod;
pub(super) use wake_mod::wake;

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
    app: AppHandle,
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
        Delivery::NeedsApproval { message, phrase } => {
            // The card is what makes the sentence below true. Without it the
            // message sat at `awaitingApproval` for ever and Decisions never
            // showed it, so the handoff was silently dropped.
            let proposed = ProposedAction {
                agent_id: Some(recipient.id.clone()),
                agent_name: recipient.name.clone(),
                chat_id: None,
                turn_id: None,
                risk: approvals::escalation_risk(phrase),
                action: "mail.handoff".into(),
                target: recipient.name.clone(),
                detail: message.body.clone(),
                cost_usd: None,
            };
            let writes = recipient.permission != PermissionMode::Plan;
            let outcome = approvals::request(&world.db, &world.account, proposed, writes)
                .map_err(|error| error.to_string())?;
            match outcome {
                Outcome::Forbidden(reason) => {
                    let _ = vibyra_core::agent_mail::set_status(&world.db, &message.id, "refused");
                    Ok(HandoffResult {
                        status: "refused".into(),
                        message: reason.into(),
                        chat_id: None,
                    })
                }
                // The broker has already decided this needs nobody: deliver it
                // rather than leave it parked against a card that never exists.
                Outcome::Allowed => {
                    let _ =
                        vibyra_core::agent_mail::set_status(&world.db, &message.id, "delivered");
                    let chat_id = wake(&world, &recipient, &message)?;
                    Ok(HandoffResult {
                        status: "delivered".into(),
                        message: format!("Handed to {} in a new chat.", recipient.name),
                        chat_id: Some(chat_id),
                    })
                }
                Outcome::Pending(card) => {
                    vibyra_core::agent_mail::link_approval(&world.db, &message.id, &card.id)
                        .map_err(|error| error.to_string())?;
                    let _ = app.emit("approval-raised", &*card);
                    Ok(HandoffResult {
                        status: "awaitingApproval".into(),
                        message: format!(
                            "That handoff asks {} to “{phrase}”, which needs your approval. \
                             It is waiting in Decisions rather than running.",
                            recipient.name
                        ),
                        chat_id: message.chat_id,
                    })
                }
            }
        }
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
