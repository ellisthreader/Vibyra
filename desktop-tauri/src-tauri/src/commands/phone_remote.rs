use crate::{
    phone::{
        remote_registration::{register, Action},
        remote_transfer_scope,
    },
    state::AppState,
};
use serde_json::{json, Value};
use tauri::State;

/// Display-only approval context. Tokens and private keys never reach the UI.
#[tauri::command]
pub fn phone_remote_transfer_context(state: State<'_, AppState>) -> Result<Value, String> {
    let profile = state
        .account
        .snapshot()
        .profile
        .ok_or("Sign in before moving this computer.")?;
    let (host, _, _) = state.phone.lock().remote_transfer_identity()?;
    Ok(json!({"accountScope":profile.welcome_key,"email":profile.email,"hostId":host}))
}

/// Only the Settings Move confirmation invokes this. There is no persistent
/// transfer flag: reconnect and automatic registration remain register-only.
#[tauri::command]
pub async fn phone_remote_transfer(
    state: State<'_, AppState>,
    expected_account: String,
    expected_host: String,
) -> Result<Value, String> {
    static TRANSFER: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _exclusive = TRANSFER
        .try_lock()
        .map_err(|_| "A computer transfer is already in progress.")?;
    let token = state
        .account
        .token()
        .ok_or("Sign in before moving this computer.")?;
    let profile = state
        .account
        .snapshot()
        .profile
        .ok_or("Sign in before moving this computer.")?;
    let (host, name, proof) = {
        let mut phone = state.phone.lock();
        let identity = phone.remote_transfer_identity()?;
        remote_transfer_scope::verify(
            &expected_account,
            &expected_host,
            &profile.welcome_key,
            &identity.0,
        )?;
        phone.account_signed_out(); // Cancel the ordinary registration loop.
        identity
    };
    let validate = || {
        let profile = state
            .account
            .snapshot()
            .profile
            .ok_or("The account changed. Review the transfer again.")?;
        let (current_host, _, _) = state.phone.lock().remote_transfer_identity()?;
        remote_transfer_scope::verify(
            &expected_account,
            &expected_host,
            &profile.welcome_key,
            &current_host,
        )?;
        if state.account.token().as_deref() != Some(token.as_str()) {
            return Err("The account session changed. Review the transfer again.".into());
        }
        Ok(())
    };
    let outcome = register(
        &state.account,
        &token,
        &host,
        name,
        &proof,
        Action::Transfer,
        &validate,
    )
    .await;
    // A sign-out/account/Host switch during the request must never restart an
    // old account's relay. The server binds proof to the original API session.
    let profile = state
        .account
        .snapshot()
        .profile
        .ok_or("The account changed. Review the transfer again.")?;
    let mut phone = state.phone.lock();
    let (current_host, _, _) = phone.remote_transfer_identity()?;
    remote_transfer_scope::verify(
        &expected_account,
        &expected_host,
        &profile.welcome_key,
        &current_host,
    )?;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("The account session changed. Review the transfer again.".into());
    }
    phone.account_signed_in(); // Ordinary register-only reconnect, even on failure.
    outcome?;
    Ok(phone.status())
}
