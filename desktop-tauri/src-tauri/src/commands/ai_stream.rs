//! The streaming half of `ai_chat`: one request, one read loop, and a
//! settlement that happens on every way out of it.

use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::ipc::Channel;

use super::ai::{ChatDelta, ChatMessage, ChatOutcome, ToolCall};
use super::ai_clamp::{estimated_input_tokens, CHARS_PER_TOKEN};

use crate::ai_usage_permit::CallPermit;

/// The cadence the PTY flusher runs at. One IPC message per token would spend
/// longer crossing the bridge than the model spent writing the token.
pub(super) const FLUSH: Duration = Duration::from_millis(16);
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
    token: &str,
    messages: Vec<ChatMessage>,
    tools: Option<serde_json::Value>,
    on_event: Channel<ChatDelta>,
    permit: CallPermit,
    cancel: &AtomicBool,
) -> Result<ChatOutcome, String> {
    let mut body = serde_json::json!({
        "messages": messages,
    });
    // Absent rather than empty when there are none: an empty array is a
    // different request, and some models refuse it.
    if let Some(tools) = tools.filter(|value| value.as_array().is_some_and(|list| !list.is_empty()))
    {
        body["tools"] = tools;
    }
    let Some(response) =
        until_cancelled(crate::assistant_api::post("chat", token, body), cancel).await?
    else {
        return Ok(ChatOutcome {
            text: String::new(),
            stopped: true,
            tool_calls: vec![],
        });
    };

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

/// Stop also works while the gateway is waiting for upstream response headers.
async fn until_cancelled<T>(
    pending: impl std::future::Future<Output = Result<T, String>>,
    cancel: &AtomicBool,
) -> Result<Option<T>, String> {
    tokio::pin!(pending);
    loop {
        if cancel.load(Ordering::Relaxed) {
            return Ok(None);
        }
        tokio::select! {
            result = &mut pending => return result.map(Some),
            _ = tokio::time::sleep(POLL) => {},
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn stop_interrupts_waiting_for_headers_and_success_passes_through() {
        let cancel = AtomicBool::new(true);
        assert!(
            until_cancelled(std::future::pending::<Result<(), String>>(), &cancel)
                .await
                .unwrap()
                .is_none()
        );
        cancel.store(false, Ordering::Relaxed);
        assert_eq!(
            until_cancelled(async { Ok(42) }, &cancel).await.unwrap(),
            Some(42)
        );
        let stop = async {
            tokio::time::sleep(Duration::from_millis(10)).await;
            cancel.store(true, Ordering::Relaxed);
        };
        let wait = until_cancelled(std::future::pending::<Result<(), String>>(), &cancel);
        let (result, ()) = tokio::join!(wait, stop);
        assert!(result.unwrap().is_none());
    }
}
