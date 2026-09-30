//! Guarded terminal teardown runs off the runtime thread.
use super::run_blocking_core;
use crate::state::AppState;
use std::sync::Arc;
use tauri::State;
use vibyra_core::{pty::SessionId, CoreError};

/// Stopping waits up to a grace period for the process to exit, which is no
/// work for a runtime worker to sit through.
#[tauri::command]
pub async fn kill_terminal(state: State<'_, AppState>, id: SessionId) -> Result<(), CoreError> {
    let manager = Arc::clone(&state.manager);
    run_blocking_core(move || manager.kill(id)).await
}

#[tauri::command]
pub async fn remove_terminal(
    state: State<'_, AppState>,
    id: SessionId,
    phone_request_id: Option<String>,
) -> Result<(), CoreError> {
    let effect = super::phone_effects::PhoneEffect::capture(
        &state,
        phone_request_id.as_deref(),
        &["close"],
        None,
        Some(i64::try_from(id).map_err(|_| CoreError::Settings("Invalid pane".into()))?),
    )
    .map_err(CoreError::Settings)?;
    let manager = Arc::clone(&state.manager);
    run_blocking_core(move || super::phone_effects::scoped(effect, |_| manager.remove(id))).await?;
    state.sink.detach(id);
    Ok(())
}
