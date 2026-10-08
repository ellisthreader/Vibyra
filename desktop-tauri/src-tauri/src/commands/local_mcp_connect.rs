//! Telling the account about a local server: its opaque id, a name and the tool
//! catalogue it lists. Never the command line, folder or environment.

use crate::agent_v2::api::{send, ApiError};
use crate::local_mcp_host::{dir, supervisor};
use crate::secret_store::SecretStore;
use crate::state::AppState;
use reqwest::Method;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use vibyra_core::local_mcp::store;

/// Starts the server if needed, lists its tools and registers them. A tool list
/// that differs from the one the person reviewed is held for review by the backend.
pub async fn register(app: &AppHandle, id: String) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let token = state.account.token().ok_or("Sign in to Vibyra first.")?;
    let folder = dir(app).ok_or("No Vibyra settings directory")?;
    let identity = folder.join("phone");
    let host = tauri::async_runtime::spawn_blocking(move || {
        vibyra_host::host_identity_id_with_key_store(&identity, &SecretStore)
    })
    .await
    .map_err(|e| e.to_string())??;
    let spec_dir = folder.clone();
    let (spec, tools) = tauri::async_runtime::spawn_blocking(move || {
        let spec = store::load(&spec_dir)
            .into_iter()
            .find(|s| s.id == id)
            .ok_or("That server is not set up here.")?;
        let tools = supervisor().list_tools(&spec).map_err(|e| e.to_string())?;
        Ok::<_, String>((spec, tools))
    })
    .await
    .map_err(|e| e.to_string())??;
    let body = json!({"hostId": host, "localId": spec.id, "name": spec.name,
        "tools": tools.iter().map(|t| t.catalogue()).collect::<Vec<_>>()});
    let base = crate::account_api::base_url();
    let reply = send(
        &base,
        Some(&token),
        None,
        Method::POST,
        "local-mcp/servers",
        Some(body),
    )
    .await
    .map_err(describe)?
    .unwrap_or(Value::Null);
    let server = reply["server"].clone();
    let connection = server["connectionId"]
        .as_str()
        .filter(|c| crate::agent_computer_access::looks_uuid(c));
    let Some(connection) = connection else {
        return Err("The account's answer was unreadable.".into());
    };
    let mut saved = spec;
    saved.connection_id = Some(connection.to_owned());
    tauri::async_runtime::spawn_blocking(move || {
        store::upsert(&folder, saved).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())??;
    Ok(server)
}

/// Removes the account's record (and every teammate's grant on it). A server already
/// gone from the account is fine; anything else is reported so nothing is orphaned.
pub async fn forget(app: &AppHandle, connection: &str) -> Result<(), String> {
    if !crate::agent_computer_access::looks_uuid(connection) {
        return Ok(());
    }
    let token = app
        .state::<AppState>()
        .account
        .token()
        .ok_or("Sign in to Vibyra first.")?;
    let base = crate::account_api::base_url();
    match send(
        &base,
        Some(&token),
        None,
        Method::DELETE,
        &format!("local-mcp/servers/{connection}"),
        None,
    )
    .await
    {
        Ok(_) => Ok(()),
        Err(ApiError::Refused { status: 404, .. }) => Ok(()),
        Err(error) => Err(describe(error)),
    }
}

fn describe(error: ApiError) -> String {
    match error {
        ApiError::Refused { code, message, .. } if code == "provider_unavailable" => {
            let _ = message;
            "Local servers are not switched on for this account yet.".into()
        }
        ApiError::Refused { message, .. } => message,
        ApiError::Network(why) => why,
    }
}
