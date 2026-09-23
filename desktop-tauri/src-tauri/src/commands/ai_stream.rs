//! The streaming half of `ai_chat`: one request, one read loop, and a
//! settlement that happens on every way out of it.

use std::sync::atomic::AtomicBool;
use std::time::Duration;

use tauri::ipc::Channel;

use super::ai::{ChatDelta, ChatMessage, ChatOutcome, ToolCall, CHAT_MODEL, REASONING_EFFORT};
use super::ai_clamp::{estimated_input_tokens, CHARS_PER_TOKEN, MAX_OUTPUT_TOKENS};

use crate::ai_usage_permit::CallPermit;

/// The cadence the PTY flusher runs at. One IPC message per token would spend
/// longer crossing the bridge than the model spent writing the token.
pub(super) const FLUSH: Duration = Duration::from_millis(16);
/// A connection that goes quiet mid-reply should fail while someone is still
/// watching it, rather than sit out the total timeout.
const SILENT: Duration = Duration::from_secs(30);
const TOTAL: Duration = Duration::from_secs(90);
/// How often the loop looks up from the socket to see whether Stop was
/// pressed. The model can pause for a second or two before its first token,
/// and Stop has to work during that pause, not only after it.
pub(super) const POLL: Duration = Duration::from_millis(200);

#[derive(Default)]
pub(super) struct Streamed {
    pub(super) text: String,
    pub(super) stopped: bool,
    pub(super) usage: Option<(u64, u64)>,
    pub(super) error: Option<String>,
    /// Keyed by the index the model streams, because the fragments of two
    /// calls interleave and only that index says which is which.
    pub(super) tools: std::collections::BTreeMap<usize, ToolCall>,
}

pub(super) async fn run(
    key: &str,
    messages: Vec<ChatMessage>,
    tools: Option<serde_json::Value>,
    on_event: Channel<ChatDelta>,
    permit: CallPermit,
    cancel: &AtomicBool,
) -> Result<ChatOutcome, String> {
    let mut body = serde_json::json!({
        "model": CHAT_MODEL,
        "messages": messages,
        "max_completion_tokens": MAX_OUTPUT_TOKENS,
        "reasoning_effort": REASONING_EFFORT,
        "stream": true,
        "stream_options": { "include_usage": true },
    });
    // Absent rather than empty when there are none: an empty array is a
    // different request, and some models refuse it.
    if let Some(tools) = tools.filter(|value| value.as_array().is_some_and(|list| !list.is_empty()))
    {
        body["tools"] = tools;
        body["tool_choice"] = serde_json::json!("auto");
    }
    let client = reqwest::Client::builder()
        .read_timeout(SILENT)
        .build()
        .map_err(|error| format!("chat request failed: {error}"))?;
    let response = client
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key.trim())
        .json(&body)
        .timeout(TOTAL)
        .send()
        .await
        .map_err(|error| format!("chat request failed: {error}"))?;

    // The status arrives before the first chunk, so a refusal is still one
    // whole JSON body with the sentence the user should read.
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|value| value["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {status}")));
    }

    let streamed = super::ai_stream_read::read(response, &on_event, cancel).await;
    // A stopped or broken stream never gets a usage chunk, but OpenAI still
    // generated what arrived. Billing the estimate rather than nothing keeps
    // Stop from being a free-tokens button in our own ledger — and it settles
    // before any error leaves this function.
    let (input, output) = streamed.usage.unwrap_or_else(|| {
        (
            estimated_input_tokens(&messages),
            (streamed.text.len() / CHARS_PER_TOKEN) as u64,
        )
    });
    permit.finish_chat(input, output);
    if let Some(error) = streamed.error {
        return Err(error);
    }
    let text = streamed.text.trim().to_string();
    let tool_calls: Vec<ToolCall> = streamed
        .tools
        .into_values()
        .filter(|call| !call.name.is_empty())
        .collect();
    // A turn that only asks for an action carries no text, and that is not the
    // empty reply this guard is for.
    if text.is_empty() && tool_calls.is_empty() && !streamed.stopped {
        return Err("The model returned an empty reply. Send the message again.".to_string());
    }
    Ok(ChatOutcome {
        text,
        stopped: streamed.stopped,
        tool_calls,
    })
}
