use tauri::State;

use crate::account_billing;
use crate::state::AppState;

/// The account's own activity (sign-ins, devices, keys, webhooks, connections, limits), read only.
/// `null` when the server does not offer it. `before` is the id the last page ended on.
#[tauri::command]
pub async fn account_activity(
    state: State<'_, AppState>,
    before: Option<u64>,
) -> Result<serde_json::Value, String> {
    account_billing::account_activity_page(&state, before.unwrap_or(0)).await
}
