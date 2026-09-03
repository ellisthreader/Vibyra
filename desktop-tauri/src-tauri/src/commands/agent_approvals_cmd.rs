//! Commands for the decision queue.
//!
//! `approval_resolve` carries the fingerprint the card showed. A mismatch
//! means the action moved underneath it, and the native broker marks the card
//! invalidated rather than approving something the user never read.

use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};
use vibyra_core::approvals::ApprovalRequest;

use super::agent_roster::world;
use super::run_blocking;
use crate::agent_mode::gate::waiters;
use crate::agent_mode::AgentWorld;
use crate::state::AppState;

// --------------------------------------------------------------- approvals

#[tauri::command]
pub async fn approval_list(state: State<'_, AppState>) -> Result<Vec<ApprovalRequest>, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::approvals::pending(&world.db, &world.account).map_err(|e| e.to_string())
    })
    .await
}

/// Answers a decision. `fingerprint` is what the card showed; a mismatch means
/// the action moved underneath it and nothing is authorised.
#[tauri::command]
pub async fn approval_resolve(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    approved: bool,
    fingerprint: Option<String>,
) -> Result<ApprovalRequest, String> {
    let world = world(&state)?;
    let record = run_blocking({
        let world = Arc::clone(&world);
        move || {
            vibyra_core::approvals::resolve(
                &world.db,
                &world.account,
                &id,
                approved,
                fingerprint.as_deref(),
            )
            .map_err(|e| e.to_string())
        }
    })
    .await?;

    // A turn is parked on this card inside the permission gate. Waking it is
    // the whole point of the answer, and it comes first: the mail below can
    // fail without leaving a provider process waiting half an hour.
    waiters::notify(&record.id, record.state == "approved");
    if record.action == "mail.handoff" {
        deliver_handoff(&world, &record)?;
    }
    let _ = app.emit("approval-resolved", &record);
    Ok(record)
}

/// Moves the handoff a card was deciding: on if approved, refused otherwise.
///
/// A card whose message cannot be found is not an error the user can act on —
/// the link is written right after the card is raised, and the only way to
/// miss it is a crash between the two — so it is silence rather than a
/// failure, and the mail stays where it was.
fn deliver_handoff(world: &Arc<AgentWorld>, record: &ApprovalRequest) -> Result<(), String> {
    let Some(message) = vibyra_core::agent_mail::by_approval(&world.db, &record.id)
        .map_err(|error| error.to_string())?
    else {
        return Ok(());
    };
    if record.state != "approved" {
        return vibyra_core::agent_mail::set_status(&world.db, &message.id, "refused")
            .map_err(|error| error.to_string());
    }
    let Some(recipient_id) = record.agent_id.as_deref() else {
        return Ok(());
    };
    let recipient = vibyra_core::agent_profiles::get(&world.db, &world.account, recipient_id)
        .map_err(|error| error.to_string())?;
    vibyra_core::agent_mail::set_status(&world.db, &message.id, "delivered")
        .map_err(|error| error.to_string())?;
    super::agent_mail_cmd::wake(world, &recipient, &message)?;
    Ok(())
}
