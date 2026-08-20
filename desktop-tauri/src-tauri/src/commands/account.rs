use tauri::{AppHandle, State};

use crate::account_auth;
use crate::account_oauth;
use crate::account_profile;
use crate::account_types::AccountSnapshot;
use crate::state::AppState;

#[tauri::command]
pub fn account_snapshot(state: State<'_, AppState>) -> AccountSnapshot {
    state.account.snapshot()
}

#[tauri::command]
pub async fn account_restore(state: State<'_, AppState>) -> Result<AccountSnapshot, String> {
    Ok(account_auth::restore(&state).await)
}

#[tauri::command]
pub async fn account_login_email(
    state: State<'_, AppState>,
    email: String,
    password: String,
) -> Result<AccountSnapshot, String> {
    Ok(account_auth::login_email(&state, email, password).await)
}

#[tauri::command]
pub async fn account_signup_email(
    state: State<'_, AppState>,
    name: String,
    email: String,
    password: String,
) -> Result<AccountSnapshot, String> {
    Ok(account_auth::signup_email(&state, name, email, password).await)
}

#[tauri::command]
pub async fn account_oauth_start(
    app: AppHandle,
    provider: String,
) -> Result<AccountSnapshot, String> {
    Ok(account_oauth::start(app, provider).await)
}

#[tauri::command]
pub fn account_oauth_cancel(state: State<'_, AppState>) -> AccountSnapshot {
    state.account.cancel_oauth();
    state.account.snapshot()
}

#[tauri::command]
pub async fn account_profile_refresh(
    state: State<'_, AppState>,
) -> Result<AccountSnapshot, String> {
    account_profile::refresh(&state).await
}

#[tauri::command]
pub async fn account_profile_update(
    state: State<'_, AppState>,
    name: String,
    email: String,
) -> Result<AccountSnapshot, String> {
    account_profile::update(&state, name, email).await
}

#[tauri::command]
pub async fn account_password_forgot(email: String) -> Result<String, String> {
    account_profile::password_forgot(email).await
}

#[tauri::command]
pub async fn account_resend_verification(state: State<'_, AppState>) -> Result<String, String> {
    account_profile::resend_verification(&state).await
}

#[tauri::command]
pub async fn account_logout(state: State<'_, AppState>) -> Result<AccountSnapshot, String> {
    Ok(account_auth::logout(&state).await)
}

/// Opens one of the enumerated Vibyra legal pages in the system browser.
/// The renderer names a page, never a URL.
#[tauri::command]
pub fn account_open_legal(page: String) -> Result<(), String> {
    let url = match page.as_str() {
        "privacy" => "https://vibyra.app/legal/privacy",
        "terms" => "https://vibyra.app/legal/terms",
        _ => return Err("Unknown legal page.".to_owned()),
    };
    crate::provider_auth_url::open(url)
}
