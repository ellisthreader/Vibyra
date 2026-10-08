//! Companion chat through the authenticated Vibyra service. The payload ceilings
//! live in `ai_clamp`, the frame reader in `ai_sse` and the request itself in
//! `ai_stream`; what is left here is the surface the webview can call.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;

use super::ai_clamp::{clamp, estimated_input_tokens, MAX_OUTPUT_TOKENS};
use super::ai_stream;
use crate::ai_usage::{chat_cost_usd, AiCall};
use crate::state::AppState;

/// $0.25 in / $2.00 out per million tokens. The chat runs Vibyra through
/// tools, and measured on 47 real requests × 3 (`verify-assistant-live.mjs`)
/// gpt-5-mini at minimal effort got 140/141 right where gpt-5-nano managed
/// 31/47 at minimal and 134/141 at low — so the extra cents buy the accuracy.
pub const CHAT_MODEL: &str = "gpt-5-mini";

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// One batch of reply text, 16 ms of it at a time. Completion, failure and
/// token usage deliberately do not travel here: the command's return value is
/// the authority, which removes the race between the last delta and the
/// promise resolving. Usage is billing-only and never reaches the renderer.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatDelta {
    pub text: String,
}

/// One action the model asked Vibyra to take, reassembled from the fragments
/// it streamed. The arguments stay a string: they are the model's JSON, and
/// the renderer is the one place that knows what each tool expects.
#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCall {
    pub id: String,
    pub name: String,
    pub arguments: String,
}

/// The whole reply, authoritative over anything the frontend accumulated.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatOutcome {
    pub text: String,
    /// True when Stop ended it: a short reply, not a failed one.
    pub stopped: bool,
    /// What it wants done. Empty for an ordinary answer.
    pub tool_calls: Vec<ToolCall>,
}

#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    request_id: String,
    messages: Vec<ChatMessage>,
    tools: Option<serde_json::Value>,
    on_event: Channel<ChatDelta>,
    gateway: Option<bool>,
) -> Result<ChatOutcome, String> {
    if gateway != Some(true) {
        if let Some(target) = super::provider_model::route(&state)? {
            let cancel = state.usage.arm_cancel(&request_id);
            return super::provider_model::run(target, clamp(messages), tools, on_event, &cancel)
                .await;
        }
    }
    let token = crate::assistant_api::token(&state)?;

    let messages = clamp(messages);
    let estimate = chat_cost_usd(estimated_input_tokens(&messages), MAX_OUTPUT_TOKENS);
    let permit = state
        .usage
        .reserve(AiCall::Chat, state.ai_limits(), estimate)?;
    // Armed from the permit, so the flag dies with the call that owns it.
    let cancel = permit.cancel_flag(&request_id);
    ai_stream::run(&token, messages, tools, on_event, permit, &cancel).await
}

/// Stops a reply that is still being written. Always `Ok`: stopping one that
/// just finished is not an error anyone needs told about, and the id means a
/// Stop arriving after Retry has started cannot kill the retry.
#[tauri::command]
pub async fn ai_chat_stop(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    state.usage.cancel_chat(&request_id);
    Ok(())
}
