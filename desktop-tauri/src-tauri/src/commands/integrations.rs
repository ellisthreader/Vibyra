use crate::integrations::api::{self, Operation, Request};
use crate::state::AppState;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub async fn integration_request(
    state: State<'_, AppState>,
    agent_id: String,
    request: Request,
) -> Result<Value, String> {
    let token = state
        .account
        .token()
        .ok_or("Sign in to connect an account.")?;
    let world = super::agent_roster::world(&state)?;
    let checked = world.clone();
    let agent = agent_id.clone();
    super::run_blocking(move || {
        vibyra_core::agent_profiles::get(&checked.db, &checked.account, &agent)
            .map(|_| ())
            .map_err(|e| e.to_string())
    })
    .await?;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("Your Vibyra session changed. Reopen integrations.".into());
    }
    let mut result = api::call(&token, &agent_id, &request).await?;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("Your Vibyra session changed. Reopen integrations.".into());
    }
    if request.operation == Operation::Start {
        let url = result["authUrl"]
            .as_str()
            .ok_or("The provider did not return a sign-in page.")?;
        if !api::trusted_authorization(
            request.service.as_deref().unwrap_or(""),
            url,
            request.shop.as_deref(),
        ) {
            return Err("The provider returned an unexpected sign-in address.".into());
        }
        let browser_url = url.to_owned();
        if super::run_blocking(move || crate::provider_auth_url::open(&browser_url))
            .await
            .is_err()
        {
            let cancel = Request {
                operation: Operation::Cancel,
                id: result["attemptId"].as_str().map(str::to_owned),
                service: None,
                shop: None,
                enabled: None,
            };
            let _ = api::call(&token, &agent_id, &cancel).await;
            return Err("Could not open your browser. Try connecting again.".into());
        }
        result = json!({"attemptId": result["attemptId"]});
    }
    Ok(result)
}
