use std::sync::Arc;

use tauri::State;

use crate::provider_auth::ProviderAuthManager;
use crate::provider_auth_state::ProviderAccountView;
use crate::state::AppState;

use super::run_blocking;

// Every command here shells out to a provider CLI and waits on it, with a
// 5 s per-probe timeout. Declared `fn` they ran inline on the IPC thread, so
// opening the accounts pane froze the window for as long as the slowest probe
// and disconnecting froze it for a logout plus a re-probe. They are `async`
// and off-thread now; `ProviderAuthManager` is shared by `Arc` so it can move
// into the blocking closure.

fn manager(state: &State<'_, AppState>) -> Arc<ProviderAuthManager> {
    Arc::clone(&state.provider_auth)
}

#[tauri::command]
pub async fn provider_accounts(
    state: State<'_, AppState>,
) -> Result<Vec<ProviderAccountView>, String> {
    let manager = manager(&state);
    run_blocking(move || Ok(manager.accounts())).await
}

#[tauri::command]
pub async fn connect_provider_account(
    state: State<'_, AppState>,
    provider: String,
) -> Result<Vec<ProviderAccountView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.connect(&provider)).await
}

#[tauri::command]
pub async fn cancel_provider_account(
    state: State<'_, AppState>,
    provider: String,
) -> Result<Vec<ProviderAccountView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.cancel(&provider)).await
}

#[tauri::command]
pub async fn open_provider_sign_in_page(
    state: State<'_, AppState>,
    provider: String,
) -> Result<(), String> {
    let manager = manager(&state);
    run_blocking(move || manager.open_sign_in_page(&provider)).await
}

#[tauri::command]
pub async fn disconnect_provider_account(
    state: State<'_, AppState>,
    provider: String,
) -> Result<Vec<ProviderAccountView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.disconnect(&provider)).await
}
