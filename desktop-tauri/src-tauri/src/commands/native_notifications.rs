use crate::{
    native_notifications as native, notification_route::NotificationRoute, state::AppState,
};
use serde::{Deserialize, Serialize};
use tauri::{State, WebviewWindow};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Target {
    pub account: String,
    #[serde(default)]
    pub agent_id: String,
    #[serde(default)]
    pub run_id: String,
    #[serde(default)]
    pub digest_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Activation {
    id: String,
    account: String,
    agent_id: String,
    run_id: String,
    digest_id: Option<String>,
}

fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() == "main" {
        Ok(())
    } else {
        Err("Notifications belong to the main window.".into())
    }
}

#[tauri::command]
pub async fn native_notification_permission(
    window: WebviewWindow,
    ask: bool,
) -> Result<String, String> {
    main_window(&window)?;
    super::run_blocking(move || native::permission(ask).map(str::to_owned)).await
}

#[tauri::command]
pub async fn native_notification_show(
    window: WebviewWindow,
    state: State<'_, AppState>,
    title: String,
    body: Option<String>,
    target: Option<Target>,
) -> Result<(), String> {
    main_window(&window)?;
    if title.len() > 512 || body.as_ref().is_some_and(|text| text.len() > 4096) {
        return Err("Notification is too long.".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    let route = if let Some(target) = target {
        let profile = state
            .account
            .snapshot()
            .profile
            .ok_or("Sign in to open an Agent notification.")?;
        if profile.email != target.account {
            return Err("The signed-in account changed.".into());
        }
        let route = NotificationRoute {
            id: id.clone(),
            owner: profile.welcome_key,
            agent_id: target.agent_id,
            run_id: target.run_id,
            digest_id: target.digest_id,
            issued_at: native::now(),
        };
        if !route.valid(native::now()) {
            return Err("Invalid notification task.".into());
        }
        serde_json::to_string(&route).map_err(|_| "Invalid notification task.")?
    } else {
        String::new()
    };
    super::run_blocking(move || native::show(id, title, body.unwrap_or_default(), route)).await
}

#[tauri::command]
pub fn native_notification_activations(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> Result<Vec<Activation>, String> {
    main_window(&window)?;
    // Cold-launch callbacks wait while saved account identity restores. The
    // notification never logs in, changes accounts or decides an approval.
    let Some(profile) = state.account.snapshot().profile else {
        return Ok(vec![]);
    };
    Ok(native::drain(&profile.welcome_key)
        .into_iter()
        .map(|route| Activation {
            id: route.id,
            account: profile.email.clone(),
            agent_id: route.agent_id,
            run_id: route.run_id,
            digest_id: route.digest_id,
        })
        .collect())
}
