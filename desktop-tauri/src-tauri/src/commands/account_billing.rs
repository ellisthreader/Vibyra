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

/// Uses the captured native account token; the renderer cannot select a recipient.
#[tauri::command]
pub async fn account_redeem_license(
    state: State<'_, AppState>,
    license_key: String,
    expected_scope: String,
) -> Result<crate::account_types::AccountSnapshot, String> {
    if license_key.len() > 100 || license_key.trim().is_empty() {
        return Err("Enter a license key.".into());
    }
    let token = state.account.license_token(&expected_scope)?;
    let result = crate::account_api::request(
        crate::account_api::Endpoint::RedeemLicense,
        Some(&token),
        Some(serde_json::json!({"licenseKey": license_key})),
    )
    .await;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("Your account changed. Reopen Settings to check the license.".into());
    }
    let body = result.map_err(|error| error.message().to_owned())?;
    let profile = crate::account_types::profile_from_user(&body["user"])
        .ok_or("The membership response was incomplete. Refresh your account.")?;
    state
        .account
        .apply_license_profile(&token, &expected_scope, profile)
}

/// Acknowledges presentation only. Neither this command nor the API grants credits.
#[tauri::command]
pub async fn account_license_welcome(
    state: State<'_, AppState>,
    expected_scope: String,
    welcome_id: String,
) -> Result<(), String> {
    if uuid::Uuid::parse_str(&welcome_id).is_err() {
        return Err("Invalid welcome.".into());
    }
    let token = state.account.license_token(&expected_scope)?;
    let body = crate::account_api::request(
        crate::account_api::Endpoint::LicenseWelcome,
        Some(&token),
        Some(serde_json::json!({"welcomeId":welcome_id})),
    )
    .await
    .map_err(|error| error.message().to_owned())?;
    if body["ok"].as_bool() != Some(true) {
        return Err("The welcome acknowledgement was incomplete.".into());
    }
    state
        .account
        .acknowledge_license_welcome(&token, &expected_scope, &welcome_id)
}

#[tauri::command]
pub async fn account_spend_caps(state: State<'_, AppState>) -> Result<serde_json::Value, String> {
    account_billing::spend_caps(&state).await
}

/// Changes limits: only the fields the backend defines, checked natively.
#[tauri::command]
pub async fn account_spend_caps_set(
    state: State<'_, AppState>,
    change: serde_json::Value,
) -> Result<serde_json::Value, String> {
    account_billing::set_spend_caps(&state, change).await
}

/// Raises the daily or monthly limit for this period only.
#[tauri::command]
pub async fn account_spend_caps_raise(
    state: State<'_, AppState>,
    cap: String,
    tokens: Option<f64>,
) -> Result<serde_json::Value, String> {
    account_billing::raise_spend_cap(&state, &cap, tokens).await
}
