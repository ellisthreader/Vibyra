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
