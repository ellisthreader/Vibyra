use tauri::State;

use crate::account_billing::{self, CreditsSummary, TopupOption};
use crate::state::AppState;

#[tauri::command]
pub async fn account_credits(state: State<'_, AppState>) -> Result<CreditsSummary, String> {
    account_billing::credits(&state).await
}

#[tauri::command]
pub async fn account_topup_options() -> Result<Vec<TopupOption>, String> {
    account_billing::topups().await
}

/// Opens the Stripe customer portal in the system browser.
#[tauri::command]
pub async fn account_billing_portal(state: State<'_, AppState>) -> Result<(), String> {
    account_billing::open_portal(&state).await
}

/// Opens Stripe Checkout for one top-up size.
#[tauri::command]
pub async fn account_billing_topup(
    state: State<'_, AppState>,
    topup: String,
) -> Result<(), String> {
    account_billing::open_topup_checkout(&state, topup).await
}

/// Opens an enumerated billing page: `plans` or `appStore`. The renderer
/// names a page, never a URL.
#[tauri::command]
pub fn account_billing_page(page: String) -> Result<(), String> {
    account_billing::open_page(&page)
}
