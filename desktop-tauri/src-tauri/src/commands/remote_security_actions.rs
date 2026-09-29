use super::remote_security_scope::{Context, Scope};
use crate::state::AppState;
use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::State;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SessionDecision {
    id: String,
    public_key: String,
    permissions: Vec<String>,
    allow: bool,
}

#[tauri::command]
pub async fn remote_security_decide_session(
    state: State<'_, AppState>,
    scope: Scope,
    decision: SessionDecision,
) -> Result<(), String> {
    if decision.id.len() != 32
        || !decision
            .id
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
    {
        return Err("Invalid connection request.".into());
    }
    let context = Context::capture(&state, Some(&scope))?;
    let action = if decision.allow { "allow" } else { "deny" };
    let path = format!(
        "/api/remote/hosts/{}/sessions/{}",
        scope.host_id, decision.id
    );
    let parameters = json!({"decision":action,"permissions":decision.permissions,"deviceId":decision.public_key});
    let challenge = context
        .request(
            &state,
            Method::POST,
            &format!("{path}/challenge"),
            Some(json!({"decision":action})),
        )
        .await?;
    verify(&challenge, &scope, "session", &decision.id, &parameters)?;
    let proof = context
        .proof
        .as_ref()
        .ok_or("Start sharing on this computer first.")?
        .answer(
            challenge["ciphertext"]
                .as_str()
                .ok_or("Invalid computer verification.")?,
        )?;
    context
        .request(
            &state,
            Method::POST,
            &format!("{path}/decision"),
            Some(json!({"decision":action,"challengeId":challenge["challengeId"],"proof":proof})),
        )
        .await?;
    Ok(())
}

#[tauri::command]
pub async fn remote_security_set_mode(
    state: State<'_, AppState>,
    scope: Scope,
    mode: String,
) -> Result<(), String> {
    if !["ask", "trusted", "disabled"].contains(&mode.as_str()) {
        return Err("Choose a remote access mode.".into());
    }
    let context = Context::capture(&state, Some(&scope))?;
    if scope.host_id.is_empty() {
        return Err("Start sharing on this computer first.".into());
    }
    let path = format!("/api/remote/hosts/{}/security", scope.host_id);
    if mode == "disabled" {
        let local = {
            let mut phone = state.phone.lock();
            let cloud = phone.set_remote(false);
            let nearby = phone.host()?.set_lan_approval_mode("disabled");
            cloud.and(nearby)
        };
        context
            .request(
                &state,
                Method::POST,
                &path,
                Some(json!({"mode":"disabled"})),
            )
            .await?;
        return local;
    }
    let parameters = json!({"mode":mode});
    let challenge = context
        .request(
            &state,
            Method::POST,
            &format!("{path}/challenge"),
            Some(parameters.clone()),
        )
        .await?;
    verify(&challenge, &scope, "policy", &scope.host_id, &parameters)?;
    let proof = context
        .proof
        .as_ref()
        .ok_or("Start sharing on this computer first.")?
        .answer(
            challenge["ciphertext"]
                .as_str()
                .ok_or("Invalid computer verification.")?,
        )?;
    context
        .request(
            &state,
            Method::POST,
            &path,
            Some(json!({"mode":mode,"challengeId":challenge["challengeId"],"proof":proof})),
        )
        .await?;
    context.check(&state)?;
    let mut phone = state.phone.lock();
    phone.host()?.set_lan_approval_mode(&mode)?;
    phone.set_remote(true)?;
    Ok(())
}

#[tauri::command]
pub async fn remote_security_disable_all(
    state: State<'_, AppState>,
    scope: Scope,
) -> Result<(), String> {
    let context = Context::capture(&state, Some(&scope))?;
    // Stop both Cloud and nearby access immediately, before network I/O.
    let local_error = state.phone.lock().disable().err();
    context.disable_all_cloud(&state).await.map_err(|error| {
        format!("This computer stopped sharing. Other computers could not be disabled: {error}")
    })?;
    if local_error.is_some() {
        return Err("Remote access is disabled. The local preference could not be saved; keep Vibyra closed after quitting until storage is available.".into());
    }
    Ok(())
}

fn verify(
    challenge: &Value,
    scope: &Scope,
    purpose: &str,
    resource: &str,
    parameters: &Value,
) -> Result<(), String> {
    if challenge["hostId"] != scope.host_id
        || challenge["purpose"] != purpose
        || challenge["resource"] != resource
        || &challenge["parameters"] != parameters
    {
        return Err("The request changed. Review remote access again.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn disabled_policy_drops_cloud_locally_before_network_io() {
        let code = include_str!("remote_security_actions.rs");
        let disabled = code
            .split("if mode == \"disabled\"")
            .nth(1)
            .unwrap()
            .split("let parameters")
            .next()
            .unwrap();
        assert!(disabled.find("set_remote(false)").unwrap() < disabled.find(".await?").unwrap());
        assert!(!disabled.contains("remote_disconnect_all"));
    }
}
