use std::sync::Arc;

use tauri::State;

use crate::provider_auth::ProviderAuthManager;
use crate::provider_auth_state::ProviderView;
use crate::state::AppState;

use super::run_blocking;

// Every command here shells out to a provider CLI and waits on it, bounded by
// `PROBE_TIMEOUT`. Declared `fn` they ran inline on the IPC thread, so
// opening the accounts pane froze the window for as long as the slowest probe
// and disconnecting froze it for a logout plus a re-probe. They are `async`
// and off-thread now; `ProviderAuthManager` is shared by `Arc` so it can move
// into the blocking closure.
//
// Each takes the account as well as the provider: one company can hold several
// logins, and "disconnect OpenAI" is not a thing the user can mean any more.

fn manager(state: &State<'_, AppState>) -> Arc<ProviderAuthManager> {
    Arc::clone(&state.provider_auth)
}

#[tauri::command]
pub async fn provider_accounts(state: State<'_, AppState>) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || Ok(manager.accounts())).await
}

#[tauri::command]
pub async fn connect_provider_account(
    state: State<'_, AppState>,
    provider: String,
    account: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.connect(&provider, &account)).await
}

/// Creates a second (or third) account for a company and starts its sign-in.
#[tauri::command]
pub async fn add_provider_account(
    state: State<'_, AppState>,
    provider: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.add_account(&provider)).await
}

/// Signs an account out and deletes its folder. The first account for a
/// provider is the CLI's own and can only be signed out, never removed.
#[tauri::command]
pub async fn remove_provider_account(
    state: State<'_, AppState>,
    provider: String,
    account: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.remove_account(&provider, &account)).await
}

/// Installs the provider's CLI. Runs as a tracked child rather than a blocked
/// call: an npm install is minutes long, and the row reports its progress and
/// its failure the same way a sign-in does.
#[tauri::command]
pub async fn install_provider_cli(
    state: State<'_, AppState>,
    provider: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.install(&provider)).await
}

/// Answers the question the provider CLI is currently asking — the pasted
/// authorization code, or whatever else it stopped on.
#[tauri::command]
pub async fn submit_provider_account_input(
    state: State<'_, AppState>,
    provider: String,
    account: String,
    value: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.submit(&provider, &account, &value)).await
}

#[tauri::command]
pub async fn cancel_provider_account(
    state: State<'_, AppState>,
    provider: String,
    account: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.cancel(&provider, &account)).await
}

#[tauri::command]
pub async fn open_provider_sign_in_page(
    state: State<'_, AppState>,
    provider: String,
    account: String,
) -> Result<(), String> {
    let manager = manager(&state);
    run_blocking(move || manager.open_sign_in_page(&provider, &account)).await
}

#[tauri::command]
pub async fn disconnect_provider_account(
    state: State<'_, AppState>,
    provider: String,
    account: String,
) -> Result<Vec<ProviderView>, String> {
    let manager = manager(&state);
    run_blocking(move || manager.disconnect(&provider, &account)).await
}
