use crate::state::AppState;
use serde_json::{json, Value};
use tauri::State;

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOptions {
    provider: Option<String>,
    model: Option<String>,
    reasoning_effort: Option<String>,
    permission_mode: super::terminal_launch::PermissionMode,
    workspace_mode: String,
    safe_snapshot_fingerprint: Option<String>,
}

#[tauri::command]
pub async fn shared_chat_list(state: State<'_, AppState>) -> Result<Value, String> {
    let chats = state.shared_chats.clone();
    super::run_blocking(move || chats.sessions().map(|sessions| json!(sessions))).await
}

#[tauri::command]
pub async fn shared_chat_create(
    state: State<'_, AppState>,
    project_id: String,
    account_id: String,
    request_id: String,
    title: String,
    options: Option<TerminalOptions>,
) -> Result<Value, String> {
    if options.as_ref().is_some_and(|o| o.workspace_mode == "safe") {
        super::worktree_access::require_github(&state).await?;
    }
    let project = state
        .settings
        .lock()
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .cloned()
        .ok_or("Open a saved Desktop project first")?;
    let worktrees = state
        .settings_path
        .parent()
        .ok_or("Settings folder unavailable")?
        .join("terminal-worktrees");
    let options = options
        .map(|o| {
            if !matches!(o.workspace_mode.as_str(), "safe" | "shared") {
                return Err("Invalid workspace mode");
            }
            Ok(vibyra_engine::DesktopConversationOptions {
                provider: o.provider,
                model: o.model,
                reasoning_effort: o.reasoning_effort,
                full_access: o.permission_mode == super::terminal_launch::PermissionMode::Full,
                worktrees_root: (o.workspace_mode == "safe").then_some(worktrees),
                safe_snapshot_fingerprint: o.safe_snapshot_fingerprint,
            })
        })
        .transpose()?;
    let chats = state.shared_chats.clone();
    super::run_blocking(move || {
        let provider = options
            .as_ref()
            .and_then(|o| o.provider.as_deref())
            .unwrap_or("codex");
        let home = crate::provider_auth_registry::Registry::load().home(provider, &account_id)?;
        let connected = match provider {
            "codex" => crate::provider_auth_codex::probe("codex", &home).connected,
            "claude" => crate::provider_auth_claude::probe("claude", &home).connected,
            "gemini" => crate::provider_auth_gemini::probe(&home).connected,
            _ => false,
        };
        if !connected {
            return Err(format!(
                "Connect this {provider} account in Settings > Agents first."
            ));
        }
        chats.create_configured(
            project.id,
            project.name,
            project.root.into(),
            account_id,
            request_id,
            title,
            options,
        )
    })
    .await
}

#[tauri::command]
pub async fn shared_chat_request(
    state: State<'_, AppState>,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let chats = state.shared_chats.clone();
    super::run_blocking(move || chats.local(&method, params)).await
}

#[tauri::command]
pub async fn shared_chat_remove_project(
    state: State<'_, AppState>,
    project_id: String,
) -> Result<(), String> {
    let chats = state.shared_chats.clone();
    super::run_blocking(move || chats.remove_project(&project_id)).await
}

/// Opens only an explicitly clicked HTTPS link, outside the conversation webview.
#[tauri::command]
pub fn shared_chat_open_link(url: String) -> Result<(), String> {
    let parsed = reqwest::Url::parse(&url).map_err(|_| "Invalid web link")?;
    if parsed.scheme() != "https"
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || url.len() > 4096
        || url.chars().any(char::is_control)
    {
        return Err("Only HTTPS links without embedded credentials can be opened".into());
    }
    crate::provider_auth_url::open(parsed.as_str())
        .map_err(|_| "Could not open this web link".into())
}
