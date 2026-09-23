//! Companion chat, billed to the user's own OpenAI key. The payload ceilings
//! live in `ai_clamp`, the frame reader in `ai_sse` and the request itself in
//! `ai_stream`; what is left here is the surface the webview can call.

use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use tauri::State;

use super::ai_clamp::{clamp, estimated_input_tokens, MAX_OUTPUT_TOKENS};
use super::ai_stream;
use crate::ai_usage::{chat_cost_usd, AiCall};
use crate::state::AppState;

/// The cheapest OpenAI text model: $0.05 in / $0.40 out per million tokens.
pub const CHAT_MODEL: &str = "gpt-5-nano";
/// gpt-5 models bill their hidden reasoning inside the output budget, so the
/// cheapest effort is also the one that leaves the whole budget for the reply.
/// A heavier effort can spend the lot and return empty content with no error.
pub(super) const REASONING_EFFORT: &str = "minimal";

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
) -> Result<ChatOutcome, String> {
    let key = state.openai_key().ok_or_else(|| {
        crate::platform_text::for_computer(
            "Chat is not configured on this Mac. Set OPENAI_API_KEY and restart Vibyra.",
            "Chat is not configured on this computer. Set OPENAI_API_KEY and restart Vibyra.",
        )
        .to_string()
    })?;

    let messages = clamp(messages);
    let estimate = chat_cost_usd(estimated_input_tokens(&messages), MAX_OUTPUT_TOKENS);
    let permit = state
        .usage
        .reserve(AiCall::Chat, state.ai_limits(), estimate)?;
    // Armed from the permit, so the flag dies with the call that owns it.
    let cancel = permit.cancel_flag(&request_id);
    ai_stream::run(&key, messages, tools, on_event, permit, &cancel).await
}

/// Stops a reply that is still being written. Always `Ok`: stopping one that
/// just finished is not an error anyone needs told about, and the id means a
/// Stop arriving after Retry has started cannot kill the retry.
#[tauri::command]
pub async fn ai_chat_stop(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    state.usage.cancel_chat(&request_id);
    Ok(())
}
