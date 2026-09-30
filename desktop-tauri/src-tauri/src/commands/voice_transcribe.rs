//! Turning recorded speech into text: which model hears it, what language it
//! is told to expect, and the one call that does it. Split from `voice.rs`,
//! which owns the microphone — together they crossed the 200-line limit, and
//! apart each file is one thing.

use serde::Deserialize;

pub const VOICE_MODEL: &str = "whisper-1";

/// An ISO-639-1 code or nothing. Whisper takes a two-letter code and silently
/// falls back to guessing on anything else, so a malformed value is dropped
/// here rather than sent and quietly ignored.
pub(super) fn resolve_language(language: Option<String>) -> Option<String> {
    language
        .map(|value| value.trim().to_lowercase())
        .filter(|value| value.len() == 2 && value.chars().all(|c| c.is_ascii_lowercase()))
}

pub(super) async fn transcribe(
    wav: Vec<u8>,
    key: String,
    language: Option<String>,
) -> Result<String, String> {
    #[derive(Deserialize)]
    struct Transcription {
        text: String,
    }

    let part = reqwest::multipart::Part::bytes(wav)
        .file_name("audio.wav")
        .mime_str("audio/wav")
        .map_err(|e| e.to_string())?;
    let mut form = reqwest::multipart::Form::new()
        .text("model", VOICE_MODEL)
        .part("file", part);
    // Telling Whisper what to expect is both faster and more accurate than
    // letting it detect; it is also what stops it translating a reply into
    // English when it mishears the language.
    if let Some(language) = language {
        form = form.text("language", language);
    }

    let response = crate::http_client::shared()
        .post("https://api.openai.com/v1/audio/transcriptions")
        .bearer_auth(key)
        .multipart(form)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("transcription request failed: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let detail = serde_json::from_str::<serde_json::Value>(&body)
            .ok()
            .and_then(|v| v["error"]["message"].as_str().map(String::from))
            .unwrap_or_else(|| format!("HTTP {status}"));
        return Err(format!("Transcription failed: {detail}"));
    }
    let parsed: Transcription = response.json().await.map_err(|e| e.to_string())?;
    Ok(parsed.text)
}

#[cfg(test)]
mod tests {
    use super::resolve_language;

    #[test]
    fn only_a_real_two_letter_code_reaches_the_service() {
        assert_eq!(resolve_language(Some("en".into())), Some("en".into()));
        assert_eq!(resolve_language(Some(" FR ".into())), Some("fr".into()));
        // Whisper answers a full language name by silently guessing instead,
        // which looks like the setting doing nothing. Drop it here so the
        // request is honestly "detect" rather than quietly ignored.
        assert_eq!(resolve_language(Some("English".into())), None);
        assert_eq!(resolve_language(Some("e1".into())), None);
        assert_eq!(resolve_language(Some(String::new())), None);
        assert_eq!(resolve_language(None), None);
    }
}
