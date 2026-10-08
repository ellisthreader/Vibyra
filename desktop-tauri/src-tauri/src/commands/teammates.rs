use crate::{account_api, state::AppState};
use serde_json::Value;
use tauri::State;
#[path = "teammates_v2_cloud_routes.rs"]
mod cloud;
#[path = "teammates_v2_hub_routes.rs"]
mod hub;
#[path = "teammates_v2_overview_routes.rs"]
mod overview;
#[path = "teammates_v2_query_routes.rs"]
mod query;
#[path = "teammates_request_method.rs"]
mod request_method;
#[path = "teammates_v2_stage2_routes.rs"]
mod stage2;
#[path = "teammates_v2_work_routes.rs"]
mod work;
fn uuid(value: &str) -> bool {
    value.len() == 36
        && value.bytes().enumerate().all(|(i, b)| {
            if [8, 13, 18, 23].contains(&i) {
                b == b'-'
            } else {
                b.is_ascii_hexdigit()
            }
        })
}
/// PATCH/PUT/DELETE routes (Agent v2 routines and triggers §6b; hub grants and MCP reads §6c).
/// DELETE carries no body, PATCH/PUT always do, and none accepts a query.
fn permitted_method(path: &str, method: &str, has_body: bool) -> bool {
    if work::method(path, method, has_body)
        || cloud::method(path, method, has_body)
        || stage2::method(path, method, has_body)
    {
        return true;
    }
    let parts: Vec<_> = path.split('/').collect();
    match (method, parts.as_slice()) {
        ("DELETE", ["agents", "v2", "schedules" | "triggers", id]) => !has_body && uuid(id),
        ("PATCH", ["agents", "v2", "triggers", id]) => has_body && uuid(id),
        (verb, route) => hub::hub_method(route, verb, has_body),
    }
}
fn permitted(path: &str, write: bool) -> bool {
    if let Some(allowed) = work::route(path, write) {
        return allowed;
    }
    if let Some(allowed) = cloud::route(path, write) {
        return allowed;
    }
    if let Some(allowed) = stage2::route(path, write) {
        return allowed;
    }
    let parts: Vec<_> = path.split('/').collect();
    // Agent v2 reads carry exact, bounded query strings; see teammates_v2_query_routes.rs.
    if let Some(allowed) = query::v2_query(path, write) {
        return allowed;
    }
    if let Some((base, before)) = path.split_once("?before=") {
        return !write
            && uuid(before)
            && base.starts_with("vibes/chats/")
            && base.ends_with("/turns")
            && permitted(base, false);
    }
    if hub::hub_route(&parts, write) == Some(true)
        || overview::overview_route(&parts, write) == Some(true)
    {
        return true;
    }
    match parts.as_slice() {
        ["agents", "v1", "teammates" | "skills"] => true,
        ["agents", "v1", "teammates", id] => write && uuid(id),
        ["agents", "v1", "teammates", id, "archive" | "read"] => write && uuid(id),
        ["agents", "v1", "teammates", id, "chats"] => !write && uuid(id),
        ["agents", "v1", "decisions", id] => write && uuid(id),
        // Agent v2 client routes (docs/agent-v2-api-contract.md §5). Runner routes are not bridged here.
        ["agents", "v2", "runtimes"] => !write,
        ["agents", "v2", "runs"] => write,
        ["agents", "v2", "runs", id] => !write && uuid(id),
        ["agents", "v2", "runs", id, "cancel"] => write && uuid(id),
        ["agents", "v2", "actions", id, "decision"] => write && uuid(id),
        // Routines and triggers (contract §6b); PATCH/DELETE go through permitted_method.
        ["agents", "v2", "capabilities" | "connections"] => !write,
        ["agents", "v2", "schedules" | "triggers"] => write,
        ["agents", "v2", "schedules", "preview"] => write,
        ["agents", "v2", "schedules" | "triggers", id, "pause"] => write && uuid(id),
        // Teammate run notifications (Agent V2 Phase 3): read-only, never marks read.
        ["notifications", "v1", "inbox"] => !write,
        ["vibes", "wallet" | "models"] => !write,
        ["vibes", "quote" | "turns" | "consent"] => write,
        ["vibes", "turns", id] => !write && uuid(id),
        ["vibes", "turns", id, "cancel"] => write && uuid(id),
        ["vibes", "chats", id, "turns"] => !write && uuid(id),
        ["connectors"] => !write,
        // Creating the repository the New project wizard offers to make.
        ["connectors", "github", "repositories"] => write,
        ["connectors", "flows", id] => !write && uuid(id),
        ["connectors", slug, "start" | "disconnect"] => {
            write
                && !slug.is_empty()
                && slug.len() <= 64
                && slug
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'_')
        }
        _ => false,
    }
}
/// Account-scoped API bridge. No caller-selected origin, credentials or automatic write retries.
#[tauri::command]
pub async fn teammate_request(
    state: State<'_, AppState>,
    path: String,
    body: Option<Value>,
    method: Option<String>,
) -> Result<Value, String> {
    send(state, path, body, method, None).await
}
/// The roster list and read marker, per install: the only routes that take `X-Vibyra-Device` (§6d).
#[tauri::command]
pub async fn teammate_request_device(
    state: State<'_, AppState>,
    path: String,
    body: Option<Value>,
    device: String,
) -> Result<Value, String> {
    if !overview::valid_device(&device) || !overview::takes_device(&path, body.is_some()) {
        return Err("Unsupported teammate operation.".into());
    }
    send(state, path, body, None, Some(device)).await
}
async fn send(
    state: State<'_, AppState>,
    path: String,
    body: Option<Value>,
    method: Option<String>,
    device: Option<String>,
) -> Result<Value, String> {
    let allowed = match method.as_deref() {
        None => permitted(&path, body.is_some()),
        Some(verb @ ("PATCH" | "PUT" | "DELETE")) => permitted_method(&path, verb, body.is_some()),
        Some(_) => false,
    };
    if !allowed {
        return Err("Unsupported teammate operation.".into());
    }
    if body.as_ref().is_some_and(|v| v.to_string().len() > 100_000) {
        return Err("This request is too large.".into());
    }
    let token = state.account.token().ok_or("Sign in to use teammates.")?;
    let method = request_method::select(method.as_deref(), body.is_some());
    let mut request = crate::http_client::shared()
        .request(method, format!("{}/api/{}", account_api::base_url(), path))
        .bearer_auth(&token)
        .header("Accept", "application/json")
        .timeout(std::time::Duration::from_secs(30));
    if let Some(device) = device {
        request = request.header("X-Vibyra-Device", device);
    }
    if let Some(body) = body {
        request = request.json(&body);
    }
    let response = request
        .send()
        .await
        .map_err(|_| "Connection interrupted. Refresh to check the outcome.".to_string())?;
    let status = response.status().as_u16();
    let mut value: Value = response
        .json()
        .await
        .map_err(|_| "The service returned an unreadable response.".to_string())?;
    if state.account.token().as_deref() != Some(token.as_str()) {
        return Err("Your account changed. Refresh to continue.".into());
    }
    if !(200..300).contains(&status) {
        return Err(format!(
            "{}: {}{}",
            status,
            account_api::error_detail(&value, status),
            overview::error_suffix(&path, &value)
        ));
    }
    if let Some(wallet) = value.get_mut("wallet").and_then(Value::as_object_mut) {
        wallet.remove("accountToken");
    }
    if path.starts_with("connectors/") && path.ends_with("/start") {
        crate::provider_auth_url::open(value["url"].as_str().ok_or("Missing sign-in address.")?)?;
        if let Some(object) = value.as_object_mut() {
            object.remove("url");
        }
    }
    Ok(value)
}
#[cfg(test)]
#[path = "teammates_v2_routes_test.rs"]
mod v2_routes_test;
