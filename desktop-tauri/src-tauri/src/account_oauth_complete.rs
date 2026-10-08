use super::*;
use crate::account_api::{request, ApiError};
use crate::account_types::profile_from_user;

/// Consumes the one-time completion payload: verifies the returned session
/// against /api/session before persisting it.
pub(super) async fn verify_completed(
    app: &AppHandle,
    body: serde_json::Value,
    cancel: &Arc<AtomicBool>,
    epoch: u64,
) -> Result<(), String> {
    if hold_second_factor(&app.state::<AppState>().account, &body, cancel, epoch)? {
        return Ok(());
    }
    let token = body
        .get("token")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "The account service returned an unexpected response.".to_owned())?;
    // The status response is one-shot. Keep its token in native memory while a
    // temporary backend outage clears, instead of discarding a completed login.
    let deadline = std::time::Instant::now() + Duration::from_secs(90);
    loop {
        if cancel.load(Ordering::SeqCst) || !app.state::<AppState>().account.attempt_current(epoch)
        {
            return Err("Sign-in cancelled.".into());
        }
        match request(Endpoint::Session, Some(token), None).await {
            Ok(session) => {
                let profile =
                    profile_from_user(session.get("user").unwrap_or(&serde_json::Value::Null))
                        .ok_or_else(|| {
                            "The account service returned an unexpected response.".to_owned()
                        })?;
                let state = app.state::<AppState>();
                if cancel.load(Ordering::SeqCst) {
                    return Err("Sign-in cancelled.".into());
                }
                if !state
                    .account
                    .adopt_for_attempt(epoch, token.to_owned(), profile, || {
                        bind_preview_account(&state, session.get("user"));
                        state.phone.lock().account_signed_in();
                    })
                {
                    return Err("Sign-in cancelled.".into());
                }
                return Ok(());
            }
            Err(ApiError::Unauthorized(message)) => return Err(message),
            Err(ApiError::Network(_)) if std::time::Instant::now() < deadline => {
                tokio::time::sleep(Duration::from_secs(2)).await;
            }
            Err(error) => return Err(error.message().to_owned()),
        }
    }
}

fn hold_second_factor(
    account: &crate::account_session::AccountSessionManager,
    body: &serde_json::Value,
    cancel: &Arc<AtomicBool>,
    epoch: u64,
) -> Result<bool, String> {
    if body.get("token").is_some_and(|token| !token.is_null()) {
        return Ok(false);
    }
    let Some(challenge) = crate::account_login::two_factor_challenge(body) else {
        return Ok(false);
    };
    if cancel.load(Ordering::SeqCst) {
        return Err("Sign-in cancelled.".into());
    }
    account.challenge_for_attempt(epoch, challenge);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::account_session::AccountSessionManager;

    #[test]
    fn provider_completion_holds_a_native_challenge_without_a_session() {
        let account = AccountSessionManager::default();
        let (epoch, cancel) = account.begin_oauth_attempt("google".into(), || {});
        let body = serde_json::json!({"twoFactor": {"challengeId": "google-challenge"}});
        assert_eq!(
            hold_second_factor(&account, &body, &cancel, epoch),
            Ok(true)
        );
        assert_eq!(account.snapshot().status, "twoFactor");
        assert!(account.token().is_none());
        assert!(!serde_json::to_string(&account.snapshot())
            .unwrap()
            .contains("google-challenge"));
        assert_eq!(account.begin_code_attempt().unwrap().1, "google-challenge");
    }

    #[test]
    fn cancelled_or_superseded_provider_completion_cannot_open_the_code_step() {
        let body = serde_json::json!({"twoFactor": {"challengeId": "stale"}});
        let account = AccountSessionManager::default();
        let (epoch, cancel) = account.begin_oauth_attempt("google".into(), || {});
        account.cancel_oauth();
        assert!(hold_second_factor(&account, &body, &cancel, epoch).is_err());
        assert_eq!(account.snapshot().status, "signedOut");
        let (epoch, cancel) = account.begin_oauth_attempt("google".into(), || {});
        account.begin_attempt(None, || {});
        hold_second_factor(&account, &body, &cancel, epoch).ok();
        assert_eq!(account.snapshot().status, "authorizing");
        assert!(account.begin_code_attempt().is_none());
    }

    #[test]
    fn malformed_challenges_and_session_payloads_do_not_open_the_code_step() {
        let account = AccountSessionManager::default();
        let (epoch, cancel) = account.begin_oauth_attempt("google".into(), || {});
        for body in [
            serde_json::json!({"twoFactor": {"challengeId": " "}}),
            serde_json::json!({"twoFactor": {"challengeId": 42}}),
            serde_json::json!({"token": "session", "twoFactor": {"challengeId": "mixed"}}),
        ] {
            assert_eq!(
                hold_second_factor(&account, &body, &cancel, epoch),
                Ok(false)
            );
        }
        assert!(account.begin_code_attempt().is_none());
    }
}
