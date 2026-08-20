use serde::{Deserialize, Serialize};
use tauri::State;

use crate::ai_usage::{chat_cost_usd, AiCall};
use crate::state::AppState;

pub const CHAT_MODEL: &str = "gpt-4o-mini";

// Hard payload ceilings. `max_tokens` bounds what one reply can cost; the
// input side needs bounding too, because a long conversation plus a large
// memory file silently grows every subsequent request. These are structural,
// not user-tunable: they cap the price of a single call regardless of what the
// caller sends.
const MAX_OUTPUT_TOKENS: u64 = 1_200;
const MAX_MESSAGES: usize = 24;
const MAX_CHARS_PER_MESSAGE: usize = 8_000;
const MAX_TOTAL_CHARS: usize = 24_000;
/// Deliberately low (real English is nearer 4) so the pre-flight budget check
/// over-estimates rather than under-estimates the cost of a call.
const CHARS_PER_TOKEN: usize = 3;

#[derive(Serialize, Deserialize, Clone)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

/// Companion chat, billed to the user's own OpenAI key.
#[tauri::command]
pub async fn ai_chat(
    state: State<'_, AppState>,
    messages: Vec<ChatMessage>,
) -> Result<String, String> {
    let key = state.openai_key().ok_or_else(|| {
        "Add your OpenAI API key in Settings › Vibyra AI to use chat.".to_string()
    })?;

    let messages = clamp(messages);
    let estimate = chat_cost_usd(estimated_input_tokens(&messages), MAX_OUTPUT_TOKENS);
    let permit = state
        .usage
        .reserve(AiCall::Chat, state.ai_limits(), estimate)?;

    let body = serde_json::json!({
        "model": CHAT_MODEL,
        "messages": messages,
        "max_tokens": MAX_OUTPUT_TOKENS,
    });

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/chat/completions")
        .bearer_auth(key.trim())
        .json(&body)
        .timeout(std::time::Duration::from_secs(90))
        .send()
        .await
        .map_err(|e| format!("chat request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(detail);
    }

    let parsed: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    // Bill from OpenAI's own token counts when present, so the ledger tracks
    // the real invoice rather than our estimate.
    permit.finish_chat(
        parsed["usage"]["prompt_tokens"]
            .as_u64()
            .unwrap_or_else(|| estimated_input_tokens(&messages)),
        parsed["usage"]["completion_tokens"].as_u64().unwrap_or(0),
    );
    parsed["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.trim().to_string())
        .ok_or_else(|| "empty reply".to_string())
}

/// Trims a conversation to the payload ceilings, keeping the system prompt and
/// the most recent turns. Over-long content is cut with a visible marker rather
/// than dropped silently, so the model is told its context was shortened.
fn clamp(messages: Vec<ChatMessage>) -> Vec<ChatMessage> {
    let mut messages: Vec<ChatMessage> = messages
        .into_iter()
        .map(|message| ChatMessage {
            role: message.role,
            content: truncate(message.content, MAX_CHARS_PER_MESSAGE),
        })
        .collect();

    let system =
        (messages.first().map(|m| m.role.as_str()) == Some("system")).then(|| messages.remove(0));
    if messages.len() > MAX_MESSAGES {
        messages.drain(..messages.len() - MAX_MESSAGES);
    }
    let mut budget = MAX_TOTAL_CHARS.saturating_sub(system.as_ref().map_or(0, |m| m.content.len()));
    let mut kept = Vec::new();
    for message in messages.into_iter().rev() {
        if message.content.len() > budget {
            break;
        }
        budget -= message.content.len();
        kept.push(message);
    }
    kept.reverse();
    system.into_iter().chain(kept).collect()
}

fn truncate(content: String, limit: usize) -> String {
    if content.len() <= limit {
        return content;
    }
    let mut cut = limit;
    while cut > 0 && !content.is_char_boundary(cut) {
        cut -= 1;
    }
    format!("{}\n…[trimmed by Vibyra]", &content[..cut])
}

fn estimated_input_tokens(messages: &[ChatMessage]) -> u64 {
    let chars: usize = messages.iter().map(|m| m.content.len() + 8).sum();
    (chars / CHARS_PER_TOKEN) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    fn message(role: &str, content: &str) -> ChatMessage {
        ChatMessage {
            role: role.into(),
            content: content.into(),
        }
    }

    #[test]
    fn keeps_the_system_prompt_and_the_newest_turns() {
        let mut messages = vec![message("system", "rules")];
        for index in 0..40 {
            messages.push(message("user", &format!("turn {index}")));
        }
        let clamped = clamp(messages);
        assert_eq!(clamped.len(), MAX_MESSAGES + 1);
        assert_eq!(clamped[0].role, "system");
        assert_eq!(clamped.last().unwrap().content, "turn 39");
    }

    #[test]
    fn caps_total_and_per_message_size() {
        let messages = vec![
            message("system", &"s".repeat(MAX_CHARS_PER_MESSAGE * 2)),
            message("user", &"u".repeat(MAX_CHARS_PER_MESSAGE)),
            message("user", &"v".repeat(MAX_CHARS_PER_MESSAGE)),
            message("user", &"w".repeat(MAX_CHARS_PER_MESSAGE)),
        ];
        let clamped = clamp(messages);
        let total: usize = clamped.iter().map(|m| m.content.len()).sum();
        assert!(total <= MAX_TOTAL_CHARS + "\n…[trimmed by Vibyra]".len());
        assert!(clamped[0].content.ends_with("…[trimmed by Vibyra]"));
    }

    #[test]
    fn truncation_never_splits_a_multibyte_character() {
        let content = "é".repeat(MAX_CHARS_PER_MESSAGE);
        assert!(truncate(content, MAX_CHARS_PER_MESSAGE).is_char_boundary(0));
    }

    #[test]
    fn the_cost_estimate_is_not_lower_than_a_four_chars_per_token_reading() {
        let messages = vec![message("user", &"a".repeat(4_000))];
        assert!(estimated_input_tokens(&messages) >= 1_000);
    }
}
