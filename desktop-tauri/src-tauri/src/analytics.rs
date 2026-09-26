//! Native-only authenticated telemetry transport and consent enforcement.
//! The renderer supplies only named events with bounded categorical fields.

use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{json, Value};

use crate::account_api::{self, Endpoint};
use crate::analytics_event::{payload, Event};
use crate::analytics_store::Choice;
use crate::state::AppState;

#[derive(Serialize)]
pub struct ConsentSnapshot {
    choice: Choice,
    policy_version: u8,
    available: bool,
    pending_sync: bool,
}

fn account_scope(state: &AppState) -> Result<(String, String), String> {
    let profile = state
        .account
        .snapshot()
        .profile
        .ok_or("Sign in to Vibyra first.")?;
    let token = state.account.token().ok_or("Sign in to Vibyra first.")?;
    Ok((profile.welcome_key, token))
}

fn response_choice(value: &Value) -> Result<Choice, String> {
    if value.get("policy_version").and_then(Value::as_u64) != Some(1) {
        return Err("Analytics choices need an app update.".into());
    }
    serde_json::from_value(value.get("choice").cloned().unwrap_or(Value::Null))
        .map_err(|_| "The analytics service returned an unexpected choice.".into())
}

fn snapshot(choice: Choice, available: bool, pending_sync: bool) -> ConsentSnapshot {
    ConsentSnapshot {
        choice,
        policy_version: 1,
        available,
        pending_sync,
    }
}

fn reassert_on_new_session(remote: Choice, local: Choice) -> Option<Choice> {
    (remote == Choice::Unknown && local != Choice::Unknown).then_some(local)
}

async fn update_remote(token: &str, choice: Choice) -> Result<Choice, String> {
    let value = account_api::request(
        Endpoint::AnalyticsConsentUpdate,
        Some(token),
        Some(json!({"surface":"desktop", "choice":choice, "policy_version":1})),
    )
    .await
    .map_err(|error| error.message().to_owned())?;
    response_choice(&value)
}

pub async fn consent_get(state: &AppState) -> Result<ConsentSnapshot, String> {
    let (scope, token) = account_scope(state)?;
    let local = state.analytics.bind(&scope);
    state.analytics.unverify(&scope);
    if local.pending_decline {
        match update_remote(&token, Choice::Declined).await {
            Ok(_) => state.analytics.set_verified(&scope, Choice::Declined),
            Err(_) => return Ok(snapshot(Choice::Declined, false, true)),
        }
    }
    let response = account_api::request(Endpoint::AnalyticsConsent, Some(&token), None).await;
    let Ok(value) = response else {
        return Ok(snapshot(state.analytics.bind(&scope).choice, false, false));
    };
    let mut choice = response_choice(&value)?;
    // A rotated bearer is a fresh server session. A saved choice on this same
    // Mac/account may be reasserted, but no event leaves until PUT succeeds.
    if let Some(saved_choice) = reassert_on_new_session(choice, local.choice) {
        match update_remote(&token, saved_choice).await {
            Ok(accepted) => choice = accepted,
            Err(_) => return Ok(snapshot(local.choice, false, false)),
        }
    }
    state.analytics.set_verified(&scope, choice);
    Ok(snapshot(choice, true, false))
}

#[cfg(test)]
mod tests {
    use super::{reassert_on_new_session, Choice};

    #[test]
    fn a_new_bearer_requires_reassertion_before_collection() {
        assert_eq!(
            reassert_on_new_session(Choice::Unknown, Choice::Linked),
            Some(Choice::Linked)
        );
        assert_eq!(
            reassert_on_new_session(Choice::Unknown, Choice::Unknown),
            None
        );
        assert_eq!(
            reassert_on_new_session(Choice::Declined, Choice::Linked),
            None
        );
    }
}

pub async fn consent_set(state: &AppState, choice: Choice) -> Result<ConsentSnapshot, String> {
    if choice == Choice::Unknown {
        return Err("Choose an analytics preference.".into());
    }
    let (scope, token) = account_scope(state)?;
    state.analytics.bind(&scope);
    if choice == Choice::Declined {
        state.analytics.decline_now(&scope);
    }
    match update_remote(&token, choice).await {
        Ok(accepted) => {
            state.analytics.set_verified(&scope, accepted);
            Ok(snapshot(accepted, true, false))
        }
        Err(error) if choice == Choice::Declined => {
            let _ = error;
            Ok(snapshot(Choice::Declined, false, true))
        }
        Err(error) => Err(error),
    }
}

pub async fn track(
    state: &AppState,
    event: Event,
    properties: BTreeMap<String, Value>,
    event_id: Option<String>,
    app_version: &str,
) -> Result<(), String> {
    let (scope, _) = account_scope(state)?;
    state.analytics.bind(&scope);
    let body = payload(event, properties, event_id, app_version)?;
    if !state.analytics.enqueue(&scope, body) {
        return Ok(());
    }
    flush(state).await
}

pub async fn flush(state: &AppState) -> Result<(), String> {
    let (scope, token) = account_scope(state)?;
    let Ok(_guard) = state.analytics.flush_lock.try_lock() else {
        return Ok(());
    };
    while let Some(next) = state.analytics.first(&scope) {
        let id = next
            .get("event_id")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_owned();
        match account_api::request_raw(Endpoint::AnalyticsEvents, Some(&token), Some(next)).await {
            Ok((202, _)) | Ok((422, _)) => state.analytics.remove_first(&scope, &id),
            Ok((403, _)) => {
                state.analytics.decline_now(&scope);
                break;
            }
            _ => break,
        }
    }
    Ok(())
}
