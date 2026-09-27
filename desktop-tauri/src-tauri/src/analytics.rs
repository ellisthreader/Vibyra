//! Native-only authenticated telemetry transport and consent enforcement.
//! The renderer supplies only named events with bounded categorical fields.

use std::collections::BTreeMap;

use serde::Serialize;
use serde_json::{json, Value};

use crate::account_api::{self, Endpoint};
use crate::analytics_event::{payload, Event};
use crate::analytics_store::{AnalyticsStore, Choice};
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

fn accept_remote_choice(store: &AnalyticsStore, scope: &str, choice: Choice) -> ConsentSnapshot {
    // A new bearer is a new consent scope on the server. Never turn a saved
    // choice from an older session into consent for this one: another device
    // may have withdrawn it in the meantime. Unknown also drops queued events.
    store.set_verified(scope, choice);
    snapshot(choice, true, false)
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
    let choice = response_choice(&value)?;
    Ok(accept_remote_choice(&state.analytics, &scope, choice))
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

#[cfg(test)]
mod tests {
    use super::{accept_remote_choice, Choice};
    use crate::analytics_store::AnalyticsStore;
    use serde_json::json;

    #[test]
    fn new_bearer_does_not_replay_old_choice_or_offline_events() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("analytics.json");
        let old = AnalyticsStore::load(path.clone());
        old.bind("account-a");
        old.set_verified("account-a", Choice::Linked);
        assert!(old.enqueue("account-a", json!({"event_id":"old"})));
        old.clear_session();

        let next = AnalyticsStore::load(path);
        assert_eq!(next.bind("account-a").choice, Choice::Linked);
        let consent = accept_remote_choice(&next, "account-a", Choice::Unknown);
        assert_eq!(consent.choice, Choice::Unknown);
        assert!(consent.available);
        assert!(next.first("account-a").is_none());
        assert!(!next.enqueue("account-a", json!({"event_id":"new"})));

        next.set_verified("account-a", Choice::Aggregate);
        assert!(next.enqueue("account-a", json!({"event_id":"opted-in"})));
        assert_eq!(
            next.first("account-a").unwrap()["consent_mode"],
            "aggregate"
        );
    }

    #[test]
    fn remote_withdrawal_purges_queued_events() {
        let dir = tempfile::tempdir().unwrap();
        let store = AnalyticsStore::load(dir.path().join("analytics.json"));
        store.bind("account-a");
        store.set_verified("account-a", Choice::Linked);
        assert!(store.enqueue("account-a", json!({"event_id":"queued"})));

        let consent = accept_remote_choice(&store, "account-a", Choice::Declined);
        assert_eq!(consent.choice, Choice::Declined);
        assert!(store.first("account-a").is_none());
        assert!(!store.enqueue("account-a", json!({"event_id":"after"})));
    }
}
