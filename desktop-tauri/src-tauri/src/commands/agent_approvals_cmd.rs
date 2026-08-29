//! Commands for the decision queue.
//!
//! `approval_resolve` carries the fingerprint the card showed. A mismatch
//! means the action moved underneath it, and the native broker marks the card
//! invalidated rather than approving something the user never read.

use tauri::State;
use vibyra_core::approvals::ApprovalRequest;

use super::agent_roster::world;
use super::run_blocking;
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
    state: State<'_, AppState>,
    id: String,
    approved: bool,
    fingerprint: Option<String>,
) -> Result<ApprovalRequest, String> {
    let world = world(&state)?;
    run_blocking(move || {
        vibyra_core::approvals::resolve(
            &world.db,
            &world.account,
            &id,
            approved,
            fingerprint.as_deref(),
        )
        .map_err(|e| e.to_string())
    })
    .await
}
