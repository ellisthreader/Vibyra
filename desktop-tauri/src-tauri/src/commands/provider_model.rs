//! Keys never enter settings JSON, cloud sync or a phone RPC.
use super::ai::{ChatDelta, ChatMessage, ChatOutcome};
use super::ai_stream::{outcome, until_cancelled};
use super::provider_model_http as http;
use crate::{secret_store::SecretStore, state::AppState};
use serde::Serialize;
use std::sync::atomic::AtomicBool;
use tauri::ipc::Channel;

#[derive(Serialize)]
pub struct ProviderStatus {
    pub provider: String,
    pub configured: bool,
    pub hint: String,
}
fn name(provider: &str) -> Result<String, String> {
    http::endpoint(provider)?;
    Ok(format!("ai-provider-{provider}"))
}
#[tauri::command]
pub fn provider_model_status() -> Result<Vec<ProviderStatus>, String> {
    http::PROVIDERS
        .iter()
        .map(|provider| {
            let key = SecretStore.read_named(&name(provider)?)?;
            let hint = key
                .as_ref()
                .map(|key| {
                    format!(
                        "••••{}",
                        key.chars()
                            .rev()
                            .take(4)
                            .collect::<Vec<_>>()
                            .into_iter()
                            .rev()
                            .collect::<String>()
                    )
                })
                .unwrap_or_default();
            Ok(ProviderStatus {
                provider: (*provider).into(),
                configured: key.is_some(),
                hint,
            })
        })
        .collect()
}
#[tauri::command]
pub fn provider_model_save_key(provider: String, key: String) -> Result<(), String> {
    SecretStore.write_named(&name(&provider)?, Some(http::validate_key(&key)?))
}
#[tauri::command]
pub fn provider_model_remove_key(provider: String) -> Result<(), String> {
    SecretStore.write_named(&name(&provider)?, None)
}
#[tauri::command]
pub async fn provider_model_list_models(
    provider: String,
    key: Option<String>,
) -> Result<Vec<String>, String> {
    let name = name(&provider)?;
    let key = match key.filter(|key| !key.trim().is_empty()) {
        Some(key) => key,
        None => SecretStore
            .read_named(&name)?
            .ok_or("Add this provider’s key first.")?,
    };
    http::models(&provider, &key).await
}
pub(super) struct Target {
    provider: String,
    key: String,
    model: String,
}
pub(super) fn route(state: &AppState) -> Result<Option<Target>, String> {
    let config = state.settings.lock().provider_model.clone();
    if !config.enabled {
        return Ok(None);
    }
    let key = SecretStore
        .read_named(&name(&config.provider)?)?
        .ok_or("Reconnect your AI provider in Settings > Accounts.")?;
    Ok(Some(Target {
        provider: config.provider,
        key,
        model: http::validate_model(&config.model)?.into(),
    }))
}
pub(super) async fn run(
    target: Target,
    messages: Vec<ChatMessage>,
    tools: Option<serde_json::Value>,
    on_event: Channel<ChatDelta>,
    cancel: &AtomicBool,
) -> Result<ChatOutcome, String> {
    let mut body =
        serde_json::json!({ "model": target.model, "messages": messages, "stream": true });
    if let Some(tools) =
        tools.filter(|tools| tools.as_array().is_some_and(|items| !items.is_empty()))
    {
        body["tools"] = tools;
    }
    let Some(response) =
        until_cancelled(http::chat(&target.provider, &target.key, body), cancel).await?
    else {
        return Ok(ChatOutcome {
            text: String::new(),
            stopped: true,
            tool_calls: vec![],
        });
    };
    outcome(super::ai_stream_read::read(response, &on_event, cancel).await)
}
