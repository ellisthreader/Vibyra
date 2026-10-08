use tauri::State;

use crate::account_delete;
use crate::account_devices::{self, AccountDevice, RevokeOutcome};
use crate::account_security::{self, TwoFactorSetup, TwoFactorState};
use crate::state::AppState;

#[tauri::command]
pub async fn account_two_factor_delivery(
    state: State<'_, AppState>,
    send: bool,
) -> Result<crate::account_security_methods::Delivery, String> {
    crate::account_security_methods::login_delivery(&state, send).await
}
#[tauri::command]
pub async fn account_two_factor_code(state: State<'_, AppState>) -> Result<(), String> {
    crate::account_security_methods::settings_code(&state).await
}
#[tauri::command]
pub async fn account_two_factor_method_start(
    state: State<'_, AppState>,
    method: String,
    phone_number: String,
    current_code: String,
) -> Result<crate::account_security_methods::Enrollment, String> {
    crate::account_security_methods::start(&state, method, phone_number, current_code).await
}
#[tauri::command]
pub async fn account_two_factor_method_code(
    state: State<'_, AppState>,
    enrollment_id: String,
) -> Result<(), String> {
    crate::account_security_methods::resend(&state, enrollment_id).await
}
#[tauri::command]
pub async fn account_two_factor_method_confirm(
    state: State<'_, AppState>,
    enrollment_id: String,
    code: String,
) -> Result<Vec<String>, String> {
    crate::account_security_methods::confirm(&state, enrollment_id, code).await
}

#[tauri::command]
pub async fn account_two_factor_status(
    state: State<'_, AppState>,
) -> Result<TwoFactorState, String> {
    account_security::status(&state).await
}

#[tauri::command]
pub async fn account_two_factor_start(
    state: State<'_, AppState>,
) -> Result<TwoFactorSetup, String> {
    account_security::start(&state).await
}

/// Confirms a pending setup and answers with the recovery codes, which are
/// readable this once and never again.
#[tauri::command]
pub async fn account_two_factor_confirm(
    state: State<'_, AppState>,
    code: String,
) -> Result<Vec<String>, String> {
    account_security::confirm(&state, code).await
}

#[tauri::command]
pub async fn account_two_factor_recovery_codes(
    state: State<'_, AppState>,
    code: String,
) -> Result<Vec<String>, String> {
    account_security::replace_recovery_codes(&state, code).await
}

#[tauri::command]
pub async fn account_two_factor_disable(
    state: State<'_, AppState>,
    code: String,
) -> Result<(), String> {
    account_security::disable(&state, code).await
}

/// Opens the provider's own security page, for an account whose second step
/// belongs to Apple or Google rather than to Vibyra.
#[tauri::command]
pub fn account_provider_security(provider: String) -> Result<(), String> {
    account_security::open_provider_security(&provider)
}

#[tauri::command]
pub async fn account_devices(state: State<'_, AppState>) -> Result<Vec<AccountDevice>, String> {
    account_devices::list(&state).await
}

#[tauri::command]
pub async fn account_device_revoke(
    state: State<'_, AppState>,
    device: String,
) -> Result<RevokeOutcome, String> {
    account_devices::revoke_device(&state, device).await
}

#[tauri::command]
pub async fn account_devices_revoke_all(
    state: State<'_, AppState>,
) -> Result<RevokeOutcome, String> {
    account_devices::revoke_all(&state).await
}

/// Deletes an email account, proved by its password.
#[tauri::command]
pub async fn account_delete_with_password(
    state: State<'_, AppState>,
    password: String,
) -> Result<(), String> {
    account_delete::with_password(&state, password).await
}

/// Deletes an Apple or Google account by signing in with that provider once
/// more. Resolves when the provider confirms, the attempt expires, or the
/// person cancels; it is long-lived on purpose.
#[tauri::command]
pub async fn account_delete_with_provider(
    state: State<'_, AppState>,
    provider: String,
) -> Result<(), String> {
    account_delete::with_provider(&state, provider).await
}

#[tauri::command]
pub fn account_delete_cancel(state: State<'_, AppState>) {
    account_delete::cancel(&state);
}
