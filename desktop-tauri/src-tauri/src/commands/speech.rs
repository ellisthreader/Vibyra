use tauri::State;

use crate::ai_usage::{speech_cost_usd, AiCall};
use crate::state::AppState;

// Ask reading a reply aloud, billed to the user's own OpenAI key.
//
// The audio comes back as WAV rather than MP3 on purpose: WebKitGTK decodes
// media through GStreamer, and an MP3 decoder is a separate distro package
// that a given machine may simply not have. Uncompressed PCM always plays,
// and these clips are seconds long, so the size costs nothing that matters.

pub const SPEECH_MODEL: &str = "tts-1";
const DEFAULT_VOICE: &str = "nova";
/// The voices tts-1 accepts. An unknown value is replaced rather than passed
/// through, so a stale setting cannot turn every reply into an API error.
const VOICES: [&str; 6] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

/// Structural ceiling on one utterance. Bounds both the price of a single call
/// and how long a reply can hold the speakers before it can be interrupted.
pub const MAX_SPEECH_CHARS: usize = 1_200;

fn resolve_voice(requested: Option<String>) -> String {
    requested
        .filter(|voice| VOICES.contains(&voice.as_str()))
        .unwrap_or_else(|| DEFAULT_VOICE.to_string())
}

/// Trims to the ceiling on a character boundary, preferring the end of a
/// sentence so a cut-off reply does not stop mid-word.
fn clamp_text(text: &str) -> &str {
    if text.len() <= MAX_SPEECH_CHARS {
        return text;
    }
    let mut cut = MAX_SPEECH_CHARS;
    while cut > 0 && !text.is_char_boundary(cut) {
        cut -= 1;
    }
    let head = &text[..cut];
    match head.rfind(['.', '!', '?', '\n']) {
        Some(stop) if stop > MAX_SPEECH_CHARS / 2 => &head[..=stop],
        _ => head,
    }
}

#[tauri::command]
pub async fn ai_speak(
    state: State<'_, AppState>,
    text: String,
    voice: Option<String>,
) -> Result<tauri::ipc::Response, String> {
    let text = clamp_text(text.trim()).to_string();
    if text.is_empty() {
        return Err("Nothing to speak".to_string());
    }
    let key = state.openai_key().ok_or_else(|| {
        "Add your OpenAI API key in Settings › Vibyra AI to hear replies.".to_string()
    })?;
    let voice = resolve_voice(voice);
    let chars = text.chars().count() as u64;
    let permit = state
        .usage
        .reserve(AiCall::Speech, state.ai_limits(), speech_cost_usd(chars))?;

    let body = serde_json::json!({
        "model": SPEECH_MODEL,
        "voice": voice,
        "input": text,
        "response_format": "wav",
    });

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/audio/speech")
        .bearer_auth(key.trim())
        .json(&body)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("speech request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(detail);
    }

    let audio = response
        .bytes()
        .await
        .map_err(|e| format!("could not read speech audio: {e}"))?;
    permit.finish_speech(chars);
    Ok(tauri::ipc::Response::new(audio.to_vec()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn an_unknown_voice_falls_back_instead_of_reaching_the_api() {
        assert_eq!(resolve_voice(Some("hal9000".into())), DEFAULT_VOICE);
        assert_eq!(resolve_voice(None), DEFAULT_VOICE);
        assert_eq!(resolve_voice(Some("onyx".into())), "onyx");
    }

    #[test]
    fn short_text_is_left_exactly_as_it_is() {
        assert_eq!(
            clamp_text("Two panes are running."),
            "Two panes are running."
        );
    }

    #[test]
    fn long_text_is_cut_at_a_sentence_end_within_the_ceiling() {
        let text = format!("{} tail without a stop", "All good. ".repeat(400));
        let cut = clamp_text(&text);
        assert!(cut.len() <= MAX_SPEECH_CHARS);
        assert!(cut.ends_with('.'), "{cut:?}");
    }

    #[test]
    fn truncation_never_splits_a_multibyte_character() {
        let text = "é".repeat(MAX_SPEECH_CHARS);
        let cut = clamp_text(&text);
        assert!(text.is_char_boundary(cut.len()));
    }
}
