//! Explicit Cloud setup: reviewed picks and exact displayed terms, protected by the
//! original account and trusted phone socket. The frontend owns the single wake.
use super::cloud_guard::{mutation, CloudSession};
use crate::account_api::{error_detail, request, request_raw, Endpoint};
use crate::cloud_sync_task::{settings_io, Handle, SyncStatusView};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::State;
use vibyra_core::cloud_sync_settings::CLOUD_SYNC_CONSENT_VERSION;
#[path = "cloud_mac_connect_selection.rs"]
mod selection;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PickedProject {
    pub id: String,
    pub name: String,
}

#[derive(Deserialize, Serialize, Default)]
#[serde(deny_unknown_fields)]
pub struct CloudAccountsChoice {
    #[serde(
        default,
        deserialize_with = "selected",
        skip_serializing_if = "Option::is_none"
    )]
    pub claude: Option<bool>,
    #[serde(
        default,
        deserialize_with = "selected",
        skip_serializing_if = "Option::is_none"
    )]
    pub codex: Option<bool>,
    #[serde(
        default,
        deserialize_with = "selected",
        skip_serializing_if = "Option::is_none"
    )]
    pub github: Option<bool>,
}

fn selected<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Option<bool>, D::Error> {
    bool::deserialize(deserializer).map(Some)
}

const REGISTRATION_TRIES: usize = 8;

fn validate_picks(projects: &[PickedProject], open: &[(String, String)]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    if projects.len() > 100
        || projects.iter().any(|p| {
            !seen.insert(&p.id) || !open.iter().any(|(id, name)| id == &p.id && name == &p.name)
        })
    {
        return Err("The project list changed. Review your choices and try again.".into());
    }
    Ok(()) // Zero means no projects. It must never become all open projects.
}

#[tauri::command]
pub async fn cloud_sync_connect_mac(
    state: State<'_, AppState>,
    handle: State<'_, Handle>,
    projects: Vec<PickedProject>,
    consent_version: u32,
    accounts: CloudAccountsChoice,
    include_conversations: Option<bool>,
    include_env: Option<bool>,
) -> Result<SyncStatusView, String> {
    let session = CloudSession::capture(&state)?;
    let _mutation = mutation()?;
    let open: Vec<_> = state
        .settings
        .lock()
        .projects
        .iter()
        .map(|p| (p.id.clone(), p.name.clone()))
        .collect();
    validate_picks(&projects, &open)?;
    if consent_version == 0 {
        return Err("Review the Vibyra Cloud terms first.".into());
    }
    let cloud = request(Endpoint::CloudComputer, Some(&session.token), None)
        .await
        .map_err(|e| e.message().to_owned())?;
    session.check(&state)?;
    if cloud["consentVersion"].as_u64() != Some(u64::from(consent_version)) {
        return Err(
            "Vibyra Cloud terms changed. Reopen Cloud and review the current terms.".into(),
        );
    }
    let (host_id, proof) =
        state
            .account
            .with_authority(&session.token, session.epoch, || {
                state.phone.lock().cloud_identity()
            })??;
    let challenge = challenge(&state, &session, &host_id).await?;
    let id = challenge["challengeId"]
        .as_str()
        .ok_or("Vibyra Cloud returned an invalid challenge.")?;
    let answer = proof.answer(
        challenge["ciphertext"]
            .as_str()
            .ok_or("Vibyra Cloud returned an invalid challenge.")?,
    )?;
    let picked: Vec<_> = projects
        .iter()
        .map(|p| json!({"id":p.id,"name":p.name}))
        .collect();
    let body = json!({"accept":true,"consentVersion":consent_version,"hostId":host_id,
        "challengeId":id,"proof":answer,"projects":picked,"accounts":accounts});
    session.check(&state)?;
    let access = request(Endpoint::CloudComputerAccess, Some(&session.token), None)
        .await
        .map_err(|e| e.message().to_owned())?;
    session.check(&state)?;
    let current: Vec<_> = state
        .settings
        .lock()
        .projects
        .iter()
        .map(|p| (p.id.clone(), p.name.clone()))
        .collect();
    validate_picks(&projects, &current)?;
    selection::validate_existing(&projects, &current, &access)?;
    request(
        Endpoint::CloudComputerConnectMac,
        Some(&session.token),
        Some(body),
    )
    .await
    .map_err(|e| e.message().to_owned())?;
    // Persist accepted setup for its account even if its phone disconnected during the request.
    settings_io::update_for_authority(&state, &session.token, session.epoch, |s| {
        s.set_paused(false);
        s.consent_version = CLOUD_SYNC_CONSENT_VERSION;
        s.include_conversations = include_conversations.unwrap_or(s.include_conversations);
        s.include_env = include_env.unwrap_or(s.include_env);
        s.share_codex_login = false;
        for (id, _) in &current {
            s.set_project(id, projects.iter().any(|p| &p.id == id));
        }
    })?;
    handle.reconfigure();
    session.check(&state)?;
    super::cloud_page::read(&state, &session).await?;
    Ok(super::cloud_sync::status_now(&state, &handle))
}

async fn challenge(
    state: &AppState,
    session: &CloudSession,
    host_id: &str,
) -> Result<serde_json::Value, String> {
    for attempt in 0..REGISTRATION_TRIES {
        session.check(state)?;
        let body = json!({"hostId":host_id,"action":"cloud-connect"});
        let (status, value) =
            request_raw(Endpoint::RemoteChallenge, Some(&session.token), Some(body))
                .await
                .map_err(|e| e.message().to_owned())?;
        session.check(state)?;
        if (200..300).contains(&status) {
            return Ok(value);
        }
        if status == 409 && value["code"] == "host_required" && attempt + 1 < REGISTRATION_TRIES {
            tokio::time::sleep(std::time::Duration::from_millis(1500)).await;
            continue;
        }
        return Err(error_detail(&value, status));
    }
    Err("Your computer is still registering. Try again in a moment.".into())
}

#[cfg(test)]
#[path = "cloud_mac_connect_tests.rs"]
mod tests;
