use crate::account_api::{request, Endpoint};
use crate::account_auth::bind_preview_account;
use crate::account_device;
use crate::account_signup::AccountSignupDeclarations;
use crate::account_types::{profile_from_user, AccountSnapshot, AccountStatus};
use crate::state::AppState;

pub async fn login_email(state: &AppState, email: String, password: String) -> AccountSnapshot {
    let body = credential_body(&email, &password, None);
    submit_credentials(state, Endpoint::Login, body).await
}

pub async fn signup_email(
    state: &AppState,
    name: String,
    email: String,
    password: String,
    declarations: AccountSignupDeclarations,
) -> AccountSnapshot {
    let mut body = credential_body(&email, &password, Some(&name));
    if let Err(error) = declarations.add_to(&mut body) {
        let epoch = state.account.begin_attempt(None, || {});
        state
            .account
            .status_for_attempt(epoch, AccountStatus::SignedOut, Some(error.into()));
        return state.account.snapshot();
    }
    submit_credentials(state, Endpoint::Signup, body).await
}

fn credential_body(email: &str, password: &str, name: Option<&str>) -> serde_json::Value {
    let mut body = serde_json::json!({
        "email": email.trim().to_lowercase(),
        "password": password,
        "deviceName": account_device::device_label(),
        "installId": account_device::installation_id(),
    });
    if let Some(name) = name.map(str::trim).filter(|n| !n.is_empty()) {
        body["name"] = serde_json::Value::String(name.to_owned());
    }
    body
}

async fn submit_credentials(
    state: &AppState,
    endpoint: Endpoint<'_>,
    body: serde_json::Value,
) -> AccountSnapshot {
    let account = &state.account;
    let epoch = account.begin_attempt(None, || bind_preview_account(state, None));
    match request(endpoint, None, Some(body)).await {
        Ok(response) => {
            let token = response.get("token").and_then(|v| v.as_str());
            let profile =
                profile_from_user(response.get("user").unwrap_or(&serde_json::Value::Null));
            match (token, profile) {
                (Some(token), Some(profile)) => {
                    account.adopt_for_attempt(epoch, token.to_owned(), profile, || {
                        bind_preview_account(state, response.get("user"));
                        state.phone.lock().account_signed_in();
                    });
                }
                // A password alone is not the whole login for an account with a
                // second factor: the backend answers with a challenge and no
                // session. The challenge is held here and the code asked for.
                _ => match two_factor_challenge(&response) {
                    Some(challenge) => account.challenge_for_attempt(epoch, challenge),
                    None => {
                        account.status_for_attempt(
                            epoch,
                            AccountStatus::SignedOut,
                            Some("The account service returned an unexpected response.".into()),
                        );
                    }
                },
            }
        }
        Err(error) => {
            account.status_for_attempt(
                epoch,
                AccountStatus::SignedOut,
                Some(error.message().into()),
            );
        }
    }
    account.snapshot()
}

fn two_factor_challenge(response: &serde_json::Value) -> Option<String> {
    let id = response
        .get("twoFactor")?
        .get("challengeId")?
        .as_str()?
        .trim()
        .to_owned();
    (!id.is_empty()).then_some(id)
}

/// The second half of a login on an account with a second factor: the code,
/// spent against the challenge the password bought. The challenge id stays
/// native; a wrong code leaves the account on the code step with the
/// backend's own message.
pub async fn submit_two_factor(state: &AppState, code: String) -> AccountSnapshot {
    let account = &state.account;
    let Some((epoch, challenge)) = account.begin_code_attempt() else {
        return account.snapshot();
    };
    let body = serde_json::json!({
        "challengeId": challenge,
        "code": code.trim(),
        "deviceName": account_device::device_label(),
        "installId": account_device::installation_id(),
    });
    match request(Endpoint::LoginTwoFactor, None, Some(body)).await {
        Ok(response) => {
            let token = response.get("token").and_then(|v| v.as_str());
            let profile =
                profile_from_user(response.get("user").unwrap_or(&serde_json::Value::Null));
            match (token, profile) {
                (Some(token), Some(profile)) => {
                    account.adopt_for_attempt(epoch, token.to_owned(), profile, || {
                        bind_preview_account(state, response.get("user"));
                        state.phone.lock().account_signed_in();
                    });
                }
                _ => {
                    account.status_for_attempt(
                        epoch,
                        AccountStatus::TwoFactor,
                        Some("The account service returned an unexpected response.".into()),
                    );
                }
            }
        }
        Err(error) => {
            account.status_for_attempt(
                epoch,
                AccountStatus::TwoFactor,
                Some(error.message().into()),
            );
        }
    }
    account.snapshot()
}
